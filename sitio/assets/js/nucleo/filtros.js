/**
 * Filtros y búsqueda del catálogo. Lógica pura: recibe productos ya
 * normalizados y un criterio, y devuelve listas. No toca el DOM.
 *
 * Criterio: { categoria: '' | id, materiales: string[], texto: string,
 *             precioMin: número | null, precioMax: número | null }
 */
import { normalizar } from './texto.js';

export const criterioVacio = () => ({ categoria: '', materiales: [], texto: '', precioMin: null, precioMax: null });

/** Materiales que existen en una categoría ('' = todas), con cuántas piezas tiene cada uno. */
export function materialesDe(productos, categoriaId = '') {
  const cuenta = new Map();
  for (const p of productos) {
    if (categoriaId && p.categoria.id !== categoriaId) continue;
    for (const m of p.materiales) cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Todas las palabras escritas deben aparecer en el nombre, el material o la categoría. */
export function coincideTexto(producto, texto) {
  const palabras = normalizar(texto).split(' ').filter(Boolean);
  return palabras.every((palabra) => producto.indice.includes(palabra));
}

export function filtrar(productos, criterio) {
  const materiales = new Set(criterio.materiales ?? []);
  const { precioMin = null, precioMax = null } = criterio;
  const conPrecio = precioMin !== null || precioMax !== null;
  return productos.filter((p) => {
    if (criterio.categoria && p.categoria.id !== criterio.categoria) return false;
    // Varias casillas marcadas: basta con coincidir con cualquiera.
    if (materiales.size && !p.materiales.some((m) => materiales.has(m))) return false;
    if (criterio.texto && !coincideTexto(p, criterio.texto)) return false;
    if (conPrecio) {
      if (p.precio === null) return false;
      if (precioMin !== null && p.precio < precioMin) return false;
      if (precioMax !== null && p.precio > precioMax) return false;
    }
    return true;
  });
}

/** Resultados del buscador del encabezado, primero los que empiezan por lo escrito. */
export function buscar(productos, texto, limite = 6) {
  const consulta = normalizar(texto);
  if (!consulta) return { resultados: [], total: 0 };
  const coincidencias = productos
    .filter((p) => coincideTexto(p, consulta))
    .map((p) => {
      const nombre = normalizar(p.nombre);
      const puntos = nombre.startsWith(consulta) ? 0 : nombre.includes(consulta) ? 1 : 2;
      return { p, puntos };
    })
    .sort((a, b) => a.puntos - b.puntos || a.p.nombre.localeCompare(b.p.nombre, 'es'));
  return { resultados: coincidencias.slice(0, limite).map((c) => c.p), total: coincidencias.length };
}

/** Precio mínimo y máximo del catálogo, o null si ninguna pieza tiene precio todavía. */
export function rangoPrecios(productos) {
  const precios = productos.map((p) => p.precio).filter((v) => v !== null);
  if (!precios.length) return null;
  return { min: Math.floor(Math.min(...precios)), max: Math.ceil(Math.max(...precios)) };
}

/** Cuántos filtros hay puestos (para el contador del botón "Filtrar"). */
export function contarActivos(criterio) {
  return (
    (criterio.materiales?.length ?? 0) +
    (criterio.precioMin !== null || criterio.precioMax !== null ? 1 : 0)
  );
}

export function hayFiltros(criterio) {
  return Boolean(criterio.categoria || criterio.texto) || contarActivos(criterio) > 0;
}
