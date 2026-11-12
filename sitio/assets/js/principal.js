/**
 * Punto de entrada. Lee los datos del sitio, carga el catálogo y enciende
 * cada parte de la interfaz.
 *
 * Estructura:
 *   nucleo/   Lógica pura y con pruebas (WhatsApp, bolsa, filtros, validación).
 *   fuentes/  De dónde sale el catálogo (hoy un JSON; mañana Shopify).
 *   ui/       Lo que toca la página.
 */
import { obtenerCatalogo } from './fuentes/catalogo-json.js';
import { crearBolsa } from './ui/bolsa.js';
import { crearBuscador } from './ui/buscador.js';
import { conectarTarjetas, pintarCategorias, pintarVendidos } from './ui/catalogo.js';
import { crearDetalle } from './ui/detalle.js';
import { $, datos } from './ui/dom.js';
import { crearFiltros } from './ui/filtros.js';
import { crearFormulario } from './ui/formulario.js';
import { iniciarPagina } from './ui/pagina.js';

const app = { config: datos, textos: datos.textos };

/** Cede el turno al navegador entre pasos, para que el arranque no bloquee la página. */
const ceder = () => new Promise((listo) => setTimeout(listo, 0));

async function iniciarCatalogo() {
  const aviso = $('[data-error-catalogo]');
  try {
    app.catalogo = await obtenerCatalogo(datos, { pedir: datos.textos.pieza.pedir });
  } catch (error) {
    console.error(error);
    for (const nodo of document.querySelectorAll('.pieza--esqueleto, .categoria--esqueleto')) nodo.remove();
    $('[data-filtros]').hidden = true;
    $('#categorias').hidden = true;
    $('[data-vendidos]').hidden = true;
    aviso.hidden = false;
    return false;
  }
  aviso.hidden = true;
  app.porId = new Map(app.catalogo.productos.map((p) => [p.id, p]));
  // Primero lo que se ve antes: categorías y más vendidos. Luego, por pasos, el resto.
  pintarCategorias(app, (id) => app.filtros?.fijarCategoria(id));
  pintarVendidos(app);
  await ceder();
  app.bolsa = crearBolsa(app);
  app.detalle = crearDetalle(app);
  conectarTarjetas(app);
  await ceder();
  app.filtros = await crearFiltros(app);
  await ceder();
  app.buscador = crearBuscador(app);
  crearFormulario(app);
  return true;
}

iniciarPagina();
iniciarCatalogo();
$('[data-reintentar]')?.addEventListener('click', () => window.location.reload());
