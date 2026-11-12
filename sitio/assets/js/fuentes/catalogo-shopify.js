/**
 * ESQUELETO, todavía sin usar: fuente del catálogo desde Shopify.
 *
 * Qué falta para activarlo (ver README, "Migrar el catálogo a Shopify"):
 *   1. En config.json: "catalogo": { "fuente": "shopify", "tienda": "mi-tienda.myshopify.com",
 *      "tokenPublico": "…", "versionApi": "…" }. El token de la Storefront API es
 *      público por diseño; el de administración NUNCA debe ir en el sitio.
 *   2. En principal.js: importar este archivo cuando la fuente sea "shopify".
 *   3. En herramientas/construir.mjs: añadir https://mi-tienda.myshopify.com a
 *      connect-src y https://cdn.shopify.com a img-src de la política de seguridad.
 *   4. Revisar la consulta y el mapeo de abajo contra la versión vigente de la API.
 */
import { normalizarCatalogo } from '../nucleo/catalogo.js';

const CONSULTA = `{
  products(first: 100) {
    nodes {
      handle title description productType tags
      priceRange { minVariantPrice { amount } }
      images(first: 8) { nodes { url altText width height } }
      material: metafield(namespace: "custom", key: "material") { value }
    }
  }
}`;

export async function obtenerCatalogo(config, opciones) {
  const { tienda, tokenPublico, versionApi } = config.catalogo;
  const respuesta = await fetch(`https://${tienda}/api/${versionApi}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': tokenPublico },
    body: JSON.stringify({ query: CONSULTA }),
  });
  if (!respuesta.ok) throw new Error(`Shopify respondió ${respuesta.status}`);
  const { data } = await respuesta.json();
  // Se traduce cada producto de Shopify a la misma forma que productos.json.
  const productos = data.products.nodes.map((n) => ({
    id: n.handle,
    nombre: n.title,
    categoria: n.productType,
    material: n.material?.value,
    descripcion: n.description,
    precio: n.priceRange?.minVariantPrice?.amount,
    masVendido: n.tags.includes('mas-vendido'),
    // Pendiente: las fotos de Shopify son direcciones completas; habrá que
    // ampliar nucleo/catalogo.js y ui/dom.js para aceptarlas además de "base".
    fotos: [],
  }));
  return normalizarCatalogo({ productos }, opciones);
}
