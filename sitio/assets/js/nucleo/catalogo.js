/**
 * Catálogo: convierte los datos "crudos" (hoy productos.json, mañana Shopify)
 * en la forma única que usa toda la página. Todo lo que entra se valida y se
 * recorta aquí; lo que no cumple se descarta con un aviso en la consola.
 *
 * Forma de un producto ya normalizado:
 *   { id, nombre, nombreCompleto, categoria: {id, nombre, singular, pedir, mensaje, foto},
 *     materiales: [], material, descripcion, precio (número o null), masVendido,
 *     fotos: [{base, alt, ancho, alto}], caracteristicas: [{etiqueta, valor}], indice }
 */
import { aSlug, limpiar, normalizar } from './texto.js';

export const PATRON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PRODUCTOS = 500;

function foto(cruda) {
  if (!cruda || typeof cruda !== 'object') return null;
  const base = String(cruda.base ?? '');
  // Solo letras, números y guiones: así un dato mal escrito nunca apunta fuera de assets/fotos.
  if (!PATRON_ID.test(base) || base.length > 80) return null;
  const ancho = Number.isInteger(cruda.ancho) && cruda.ancho > 0 ? cruda.ancho : 1280;
  const alto = Number.isInteger(cruda.alto) && cruda.alto > 0 ? cruda.alto : 1600;
  return { base, alt: limpiar(cruda.alt, 220), ancho, alto };
}

function precio(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(/[^0-9.]/g, ''));
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) / 100 : null;
}

function categoria(nombre, extra = {}, plantillas = {}) {
  const limpio = limpiar(nombre, 40);
  return {
    id: aSlug(limpio),
    nombre: limpio,
    singular: limpiar(extra.singular, 40) || limpio,
    pedir: limpiar(extra.pedir, 40) || plantillas.pedir || 'Pedir esta pieza',
    mensaje: limpiar(extra.mensaje, 300),
    foto: foto(extra.foto),
    total: 0,
  };
}

/**
 * @param {object} crudo  Contenido de productos.json (o lo que entregue otra fuente).
 * @param {object} [opciones]  { pedir: texto por defecto del botón de pedido }
 */
export function normalizarCatalogo(crudo, opciones = {}) {
  const avisos = [];
  const lista = Array.isArray(crudo?.productos) ? crudo.productos.slice(0, MAX_PRODUCTOS) : [];
  const extras = crudo?.categorias && typeof crudo.categorias === 'object' ? crudo.categorias : {};
  const categorias = new Map();
  const vistos = new Set();
  const productos = [];

  for (const p of lista) {
    const id = String(p?.id ?? '');
    const nombre = limpiar(p?.nombre, 80);
    const nombreCategoria = limpiar(p?.categoria, 40);
    if (!PATRON_ID.test(id) || id.length > 60 || !nombre || !aSlug(nombreCategoria)) {
      avisos.push(`Producto descartado (revisa id, nombre y categoría): ${JSON.stringify(p?.id ?? p?.nombre ?? '?')}`);
      continue;
    }
    if (vistos.has(id)) {
      avisos.push(`Producto repetido, se usa solo el primero: ${id}`);
      continue;
    }
    vistos.add(id);

    const idCategoria = aSlug(nombreCategoria);
    if (!categorias.has(idCategoria)) {
      categorias.set(idCategoria, categoria(nombreCategoria, extras[nombreCategoria], opciones));
    }
    const cat = categorias.get(idCategoria);
    cat.total += 1;

    const materiales = (Array.isArray(p.material) ? p.material : [p.material])
      .map((m) => limpiar(m, 40))
      .filter(Boolean)
      .slice(0, 4);
    const fotos = (Array.isArray(p.fotos) ? p.fotos : []).map(foto).filter(Boolean).slice(0, 8);
    const caracteristicas = (Array.isArray(p.caracteristicas) ? p.caracteristicas : [])
      .map((c) => ({ etiqueta: limpiar(c?.etiqueta, 40), valor: limpiar(c?.valor, 80) }))
      .filter((c) => c.etiqueta && c.valor)
      .slice(0, 12);

    productos.push({
      id,
      nombre,
      nombreCompleto: `${cat.singular} ${nombre}`,
      categoria: cat,
      materiales,
      material: materiales.join(' y '),
      descripcion: limpiar(p.descripcion, 600),
      precio: precio(p.precio),
      masVendido: p.masVendido === true,
      fotos,
      caracteristicas,
      // Texto ya normalizado donde busca el buscador: nombre, material y categoría.
      indice: normalizar([nombre, cat.singular, cat.nombre, ...materiales].join(' ')),
    });
  }

  for (const cat of categorias.values()) {
    if (!cat.foto) cat.foto = productos.find((p) => p.categoria === cat && p.fotos.length)?.fotos[0] ?? null;
  }
  return { productos, categorias: [...categorias.values()], avisos };
}

/** "$1,250.00" en pesos mexicanos (o la moneda indicada en config.json). */
export function formatearPrecio(valor, moneda = 'MXN') {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(valor);
  } catch {
    return `$${Number(valor).toFixed(2)}`;
  }
}
