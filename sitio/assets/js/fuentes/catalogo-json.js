/**
 * Fuente del catálogo: el archivo datos/productos.json.
 *
 * Toda fuente debe exportar `obtenerCatalogo(config, opciones)` y devolver lo
 * que entrega normalizarCatalogo(). Para migrar a Shopify se crea otro archivo
 * con esa misma función (ver catalogo-shopify.js y el README) y se cambia
 * "catalogo.fuente" en config.json: el resto de la página no se entera.
 */
import { normalizarCatalogo } from '../nucleo/catalogo.js';

export async function obtenerCatalogo(config, opciones) {
  const respuesta = await fetch(config.catalogo.ruta, { credentials: 'same-origin' });
  if (!respuesta.ok) throw new Error(`No se pudo leer el catálogo (${respuesta.status})`);
  const catalogo = normalizarCatalogo(await respuesta.json(), opciones);
  for (const aviso of catalogo.avisos) console.warn(aviso);
  return catalogo;
}
