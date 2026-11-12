/**
 * Utilidades de texto. No tocan el DOM, así que sirven igual en el navegador,
 * en el script de construcción (Node) y en la función del servidor.
 */

// Caracteres que nunca deben viajar en un mensaje ni guardarse: controles,
// marcas de ancho cero y marcas que cambian la dirección del texto.
// Se escriben como rangos numéricos para no dejar caracteres invisibles en este archivo.
const RANGOS_PROHIBIDOS = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff],
];
const hex = (n) => `\\u{${n.toString(16)}}`;
const CONTROL = new RegExp(`[${RANGOS_PROHIBIDOS.map(([a, b]) => `${hex(a)}-${hex(b)}`).join('')}]`, 'gu');

/** Minúsculas y sin acentos, para comparar ("Ágata" -> "agata"). */
export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto de una línea: sin caracteres de control, sin espacios repetidos y con largo máximo. */
export function limpiar(valor, max = 200) {
  return String(valor ?? '')
    .normalize('NFC')
    .replace(CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Igual que limpiar(), pero conserva los saltos de línea (para mensajes). */
export function limpiarMultilinea(valor, max = 1000) {
  return String(valor ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** Sustituye {clave} por su valor. Las claves desconocidas se dejan tal cual. */
export function rellenar(plantilla, datos = {}) {
  return String(plantilla ?? '').replace(/\{(\w+)\}/g, (todo, clave) =>
    Object.prototype.hasOwnProperty.call(datos, clave) ? String(datos[clave]) : todo,
  );
}

/** "Cuarzo rosa" -> "cuarzo-rosa". Sirve para identificadores y nombres de archivo. */
export function aSlug(valor) {
  return normalizar(valor)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Elige el texto en singular o en plural según la cantidad. */
export function contar(n, uno, varios) {
  return n === 1 ? rellenar(uno, { n }) : rellenar(varios, { n });
}
