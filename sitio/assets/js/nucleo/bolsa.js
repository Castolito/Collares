/**
 * Bolsa de pedido: lógica pura, sin DOM ni localStorage.
 *
 * La bolsa es una lista ordenada de { id, cantidad }. Solo guarda
 * identificadores de producto y cantidades; nunca datos personales.
 * Ninguna función modifica la lista que recibe: siempre devuelve una nueva.
 *
 * Límites: { idsValidos: Set, maxPorPieza: número, maxDistintas: número }
 */
import { PATRON_ID } from './catalogo.js';

const VERSION = 1;

function entero(valor) {
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : NaN;
}

/**
 * Deja pasar solo lo que tiene la forma correcta. Sirve para lo que se lee
 * de localStorage, que puede estar dañado o haber sido manipulado.
 */
export function sanear(crudo, limites) {
  if (!crudo || typeof crudo !== 'object' || crudo.v !== VERSION || !Array.isArray(crudo.items)) return [];
  const bolsa = new Map();
  for (const item of crudo.items.slice(0, 200)) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [id, cantidad] = item;
    if (typeof id !== 'string' || id.length > 60 || !PATRON_ID.test(id)) continue;
    if (!limites.idsValidos.has(id)) continue; // la pieza ya no existe en el catálogo
    const n = entero(cantidad);
    if (!(n >= 1)) continue;
    if (!bolsa.has(id) && bolsa.size >= limites.maxDistintas) continue;
    bolsa.set(id, Math.min(limites.maxPorPieza, (bolsa.get(id) ?? 0) + n));
  }
  return [...bolsa].map(([id, cantidad]) => ({ id, cantidad }));
}

/** Lee el texto guardado. Cualquier problema devuelve una bolsa vacía. */
export function leer(texto, limites) {
  if (typeof texto !== 'string' || texto.length > 20000) return [];
  try {
    return sanear(JSON.parse(texto), limites);
  } catch {
    return [];
  }
}

export function serializar(items) {
  return JSON.stringify({ v: VERSION, items: items.map((i) => [i.id, i.cantidad]) });
}

/**
 * Añade una unidad. `resultado` dice qué pasó:
 * 'nueva' | 'sumada' | 'maximo' (ya tiene el tope) | 'llena' (demasiadas
 * piezas distintas) | 'desconocida' (no está en el catálogo).
 */
export function agregar(items, id, limites) {
  if (!limites.idsValidos.has(id)) return { items, resultado: 'desconocida' };
  const actual = items.find((i) => i.id === id);
  if (actual) {
    if (actual.cantidad >= limites.maxPorPieza) return { items, resultado: 'maximo' };
    return { items: items.map((i) => (i.id === id ? { id, cantidad: i.cantidad + 1 } : i)), resultado: 'sumada' };
  }
  if (items.length >= limites.maxDistintas) return { items, resultado: 'llena' };
  return { items: [...items, { id, cantidad: 1 }], resultado: 'nueva' };
}

/** Fija la cantidad de una pieza. Cero o menos la quita; más del tope se queda en el tope. */
export function fijarCantidad(items, id, cantidad, limites) {
  const n = entero(cantidad);
  if (Number.isNaN(n) || !items.some((i) => i.id === id)) return { items, resultado: 'sin-cambio' };
  if (n <= 0) return { items: quitar(items, id), resultado: 'quitada' };
  if (n > limites.maxPorPieza) {
    return { items: items.map((i) => (i.id === id ? { id, cantidad: limites.maxPorPieza } : i)), resultado: 'maximo' };
  }
  return { items: items.map((i) => (i.id === id ? { id, cantidad: n } : i)), resultado: 'cambiada' };
}

export function quitar(items, id) {
  return items.filter((i) => i.id !== id);
}

export function totalPiezas(items) {
  return items.reduce((suma, i) => suma + i.cantidad, 0);
}
