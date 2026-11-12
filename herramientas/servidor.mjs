#!/usr/bin/env node
/**
 * Servidor local para ver el sitio mientras se trabaja. Sin dependencias.
 *
 *   node herramientas/servidor.mjs            (puerto 4173)
 *   node herramientas/servidor.mjs --puerto=8080
 *   node herramientas/servidor.mjs --cabeceras   (aplica sitio/_headers, como hará Cloudflare)
 *
 * Antes de arrancar reconstruye el sitio. Lo sirve bajo la misma subruta que
 * tendrá publicado (por ejemplo /Collares/), para probar que las rutas
 * relativas funcionan igual que en GitHub Pages.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { construir } from './construir.mjs';

const SITIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sitio');
const opcion = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}`));
const puerto = Number(opcion('puerto')?.split('=')[1] ?? process.env.PORT ?? 4173);
const conCabeceras = Boolean(opcion('cabeceras'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const COMPRIMIBLE = /\.(html|css|js|mjs|json|svg|txt|xml|webmanifest)$/;

const { rutaBase, url } = await construir();

/** Lee las reglas "/*" de sitio/_headers (solo con --cabeceras). */
async function cabecerasGlobales() {
  if (!conCabeceras) return {};
  const lineas = (await fs.readFile(path.join(SITIO, '_headers'), 'utf8')).split('\n');
  const cabeceras = {};
  let dentro = false;
  for (const linea of lineas) {
    if (/^\S/.test(linea)) dentro = linea.trim() === '/*';
    else if (dentro && linea.includes(':')) {
      const [nombre, ...valor] = linea.trim().split(':');
      // En local no hay HTTPS: estas dos romperían la prueba.
      if (/^strict-transport-security$/i.test(nombre)) continue;
      cabeceras[nombre] = valor.join(':').trim().replace('; upgrade-insecure-requests', '');
    }
  }
  return cabeceras;
}
const extra = await cabecerasGlobales();

async function enviar(res, req, archivo, estado = 200) {
  let datos = await fs.readFile(archivo);
  const ext = path.extname(archivo).toLowerCase();
  const cabeceras = { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', ...extra };
  if (COMPRIMIBLE.test(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    datos = zlib.gzipSync(datos);
    cabeceras['Content-Encoding'] = 'gzip';
    cabeceras.Vary = 'Accept-Encoding';
  }
  cabeceras['Content-Length'] = datos.length;
  res.writeHead(estado, cabeceras);
  res.end(req.method === 'HEAD' ? undefined : datos);
}

http.createServer(async (req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (ruta === '/' && rutaBase !== '/') {
      res.writeHead(302, { Location: rutaBase });
      return res.end();
    }
    if (!ruta.startsWith(rutaBase)) return await enviar(res, req, path.join(SITIO, '404.html'), 404);
    let relativa = ruta.slice(rutaBase.length);
    if (relativa === '' || relativa.endsWith('/')) relativa += 'index.html';
    const archivo = path.join(SITIO, relativa);
    // Nunca se sirve nada fuera de la carpeta del sitio.
    if (!archivo.startsWith(SITIO + path.sep)) return await enviar(res, req, path.join(SITIO, '404.html'), 404);
    try {
      if ((await fs.stat(archivo)).isFile()) return await enviar(res, req, archivo);
    } catch { /* no existe */ }
    await enviar(res, req, path.join(SITIO, '404.html'), 404);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Error del servidor local: ${error.message}`);
  }
}).listen(puerto, () => {
  console.log(`Sitio construido para ${url}`);
  console.log(`Ábrelo en  http://localhost:${puerto}${rutaBase}`);
  if (conCabeceras) console.log('Aplicando los encabezados de sitio/_headers (como en Cloudflare Pages).');
  console.log('Para detenerlo: Ctrl + C');
});
