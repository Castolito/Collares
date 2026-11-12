#!/usr/bin/env node
/**
 * Prepara las imágenes del sitio. NO forma parte de la página: es una
 * herramienta de desarrollo y necesita la librería `sharp` instalada aparte
 * (ver README, sección "Cambiar las fotos").
 *
 * Qué hace:
 *   1. fotos      Convierte cada foto original a WebP en 480, 768 y 1280 px
 *                 de ancho, recortada a una proporción fija (4:5 por defecto).
 *   2. compartir  Crea la imagen de 1200 x 630 para compartir el enlace.
 *   3. favicon    Genera los iconos del sitio a partir de un SVG.
 *
 * Uso:
 *   node herramientas/imagenes.mjs fotos <carpeta-originales> [--salida=sitio/assets/fotos] [--proporcion=4:5]
 *   node herramientas/imagenes.mjs compartir <foto-original> [--salida=sitio/assets/img/compartir.jpg]
 *   node herramientas/imagenes.mjs favicon <icono.svg> [--salida=sitio]
 *
 * Recortes especiales: dentro de la carpeta de originales puede haber un
 * archivo `recortes.json` como este (todas las claves son opcionales):
 *   { "nombre-de-la-foto": { "proporcion": "4:3", "posicion": "arriba" } }
 * Posiciones válidas: atencion (por defecto), centro, arriba, abajo,
 * izquierda, derecha.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ANCHOS = [480, 768, 1280];
const EXTENSIONES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** "Collar Luna de Agua.JPG" -> "collar-luna-de-agua" */
export function aSlug(nombre) {
  return String(nombre)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function leerProporcion(texto) {
  const partes = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(texto));
  if (!partes) throw new Error(`Proporción no válida: "${texto}". Usa el formato ancho:alto, por ejemplo 4:5.`);
  return Number(partes[1]) / Number(partes[2]);
}

function posicionSharp(sharp, posicion) {
  const mapa = { centro: 'centre', arriba: 'top', abajo: 'bottom', izquierda: 'left', derecha: 'right' };
  if (!posicion || posicion === 'atencion') return sharp.strategy.attention;
  if (!mapa[posicion]) throw new Error(`Posición de recorte no válida: "${posicion}".`);
  return mapa[posicion];
}

/** Convierte todas las fotos de una carpeta. Devuelve la lista de lo generado. */
export async function procesarFotos({ sharp, entrada, salida, proporcion = '4:5', calidad = 76 }) {
  await fs.mkdir(salida, { recursive: true });
  let recortes = {};
  try {
    recortes = JSON.parse(await fs.readFile(path.join(entrada, 'recortes.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`recortes.json no se pudo leer: ${error.message}`);
  }

  const archivos = (await fs.readdir(entrada)).filter((f) => EXTENSIONES.has(path.extname(f).toLowerCase())).sort();
  const resultado = [];
  for (const archivo of archivos) {
    const base = aSlug(path.parse(archivo).name);
    const ajuste = recortes[base] ?? {};
    const razon = leerProporcion(ajuste.proporcion ?? proporcion);
    const origen = path.join(entrada, archivo);
    const meta = await sharp(origen).metadata();
    const pesos = [];
    for (const ancho of ANCHOS) {
      const alto = Math.round(ancho / razon);
      const destino = path.join(salida, `${base}-${ancho}.webp`);
      const info = await sharp(origen)
        .rotate() // respeta la orientación EXIF de la cámara
        .resize(ancho, alto, { fit: 'cover', position: posicionSharp(sharp, ajuste.posicion) })
        .webp({ quality: calidad, effort: 5 })
        .toFile(destino);
      pesos.push(`${ancho}px ${(info.size / 1024).toFixed(0)} KB`);
    }
    if (meta.width < ANCHOS.at(-1)) {
      console.warn(`  Aviso: ${archivo} mide ${meta.width}px de ancho; se amplió para llegar a ${ANCHOS.at(-1)}px.`);
    }
    resultado.push({ base, ancho: ANCHOS.at(-1), alto: Math.round(ANCHOS.at(-1) / razon) });
    console.log(`${base}: ${pesos.join(' · ')}`);
  }
  return resultado;
}

/** Imagen para compartir (Open Graph / Twitter): 1200 x 630, JPG. */
export async function crearCompartir({ sharp, origen, destino, posicion }) {
  await fs.mkdir(path.dirname(destino), { recursive: true });
  const info = await sharp(origen)
    .rotate()
    .resize(1200, 630, { fit: 'cover', position: posicionSharp(sharp, posicion) })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(destino);
  console.log(`compartir.jpg: 1200x630, ${(info.size / 1024).toFixed(0)} KB`);
}

/** Iconos del sitio a partir de un SVG: PNG de varios tamaños y favicon.ico. */
export async function crearFavicons({ sharp, origen, salida }) {
  const svg = await fs.readFile(origen);
  const img = path.join(salida, 'assets', 'img');
  await fs.mkdir(img, { recursive: true });
  const tamanos = { 'favicon-32.png': 32, 'apple-touch-icon.png': 180, 'icono-192.png': 192, 'icono-512.png': 512 };
  for (const [nombre, lado] of Object.entries(tamanos)) {
    await sharp(svg, { density: 384 }).resize(lado, lado).png().toFile(path.join(img, nombre));
  }
  const copia = path.join(img, 'favicon.svg');
  if (path.resolve(origen) !== path.resolve(copia)) await fs.copyFile(origen, copia);
  // Un .ico puede contener un PNG tal cual: cabecera de 6 bytes + entrada de 16.
  const png = await sharp(svg, { density: 384 }).resize(32, 32).png().toBuffer();
  const cabecera = Buffer.alloc(22);
  cabecera.writeUInt16LE(1, 2); // tipo: icono
  cabecera.writeUInt16LE(1, 4); // una sola imagen
  cabecera.writeUInt8(32, 6); // ancho
  cabecera.writeUInt8(32, 7); // alto
  cabecera.writeUInt16LE(1, 10); // planos
  cabecera.writeUInt16LE(32, 12); // bits por píxel
  cabecera.writeUInt32LE(png.length, 14);
  cabecera.writeUInt32LE(22, 18); // dónde empieza el PNG
  await fs.writeFile(path.join(salida, 'favicon.ico'), Buffer.concat([cabecera, png]));
  console.log(`Iconos creados en ${path.relative(RAIZ, img)} y favicon.ico`);
}

function leerOpciones(args) {
  const opciones = {};
  const libres = [];
  for (const arg of args) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (m) opciones[m[1]] = m[2];
    else libres.push(arg);
  }
  return { opciones, libres };
}

async function principal() {
  const [orden, ...resto] = process.argv.slice(2);
  const { opciones, libres } = leerOpciones(resto);
  if (!orden || !libres[0] || !['fotos', 'compartir', 'favicon'].includes(orden)) {
    console.log('Uso:\n  node herramientas/imagenes.mjs fotos <carpeta-originales>\n  node herramientas/imagenes.mjs compartir <foto-original>\n  node herramientas/imagenes.mjs favicon <icono.svg>');
    process.exit(orden ? 1 : 0);
  }
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Falta la herramienta "sharp". Consulta el README, sección "Cambiar las fotos".');
    process.exit(1);
  }
  const origen = path.resolve(libres[0]);
  if (orden === 'fotos') {
    const lista = await procesarFotos({ sharp, entrada: origen, salida: path.resolve(opciones.salida ?? path.join(RAIZ, 'sitio/assets/fotos')), proporcion: opciones.proporcion });
    console.log(`\nListo: ${lista.length} fotos. Usa estos nombres en el campo "base" de productos.json:`);
    for (const f of lista) console.log(`  { "base": "${f.base}", "ancho": ${f.ancho}, "alto": ${f.alto}, "alt": "Describe aquí la foto" }`);
  } else if (orden === 'compartir') {
    await crearCompartir({ sharp, origen, destino: path.resolve(opciones.salida ?? path.join(RAIZ, 'sitio/assets/img/compartir.jpg')), posicion: opciones.posicion });
  } else {
    await crearFavicons({ sharp, origen, salida: path.resolve(opciones.salida ?? path.join(RAIZ, 'sitio')) });
  }
}

// Solo se ejecuta si se llama directamente (no al importarlo desde otro script).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
