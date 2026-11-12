/**
 * Pinta las tarjetas de pieza, las categorías y la fila de más vendidos,
 * y conecta sus botones con la bolsa y la ventana de detalle.
 */
import { formatearPrecio } from '../nucleo/catalogo.js';
import { contar } from '../nucleo/texto.js';
import { enlaceWhatsApp, mensajeProducto } from '../nucleo/whatsapp.js';
import { $, clonar, imagen } from './dom.js';

const TAMANOS_TARJETA = '(min-width: 1400px) 310px, (min-width: 992px) 31vw, (min-width: 420px) 46vw, 92vw';

/** Texto del precio: el número si existe; si no, "Consulta precio por WhatsApp". */
export function pintarPrecio(elemento, producto, app) {
  const hay = producto.precio !== null;
  elemento.textContent = hay ? formatearPrecio(producto.precio, app.config.catalogo.moneda) : app.textos.pieza.precioConsulta;
  elemento.classList.toggle('pieza__precio--valor', hay);
}

export const enlacePedido = (producto, app) => enlaceWhatsApp(app.config.contacto.whatsapp, mensajeProducto(producto, app.config));

export function crearTarjeta(producto, app, { sizes = TAMANOS_TARJETA } = {}) {
  const t = app.textos;
  const li = clonar('plantilla-pieza');
  li.dataset.id = producto.id;
  if (producto.fotos[0]) $('.pieza__foto', li).append(imagen(producto.fotos[0], { sizes }));
  $('.pieza__etiqueta', li).hidden = !producto.masVendido;
  $('.pieza__material', li).textContent = `${producto.categoria.singular} · ${producto.material}`;

  const abrir = $('.pieza__abrir', li);
  abrir.textContent = producto.nombre;
  abrir.setAttribute('aria-label', `${t.pieza.verDetalle}: ${producto.nombreCompleto}`);
  pintarPrecio($('.pieza__precio', li), producto, app);

  $('[data-accion="anadir"]', li).setAttribute('aria-label', `${t.pieza.anadir}: ${producto.nombreCompleto}`);
  const pedir = $('[data-accion="pedir"]', li);
  pedir.href = enlacePedido(producto, app);
  $('[data-texto]', pedir).textContent = producto.categoria.pedir;
  pedir.setAttribute('aria-label', `${producto.categoria.pedir}: ${producto.nombre} (${t.nuevaPestana})`);
  return li;
}

/** Tarjetas grandes de "Compra por categoría", generadas a partir del catálogo. */
export function pintarCategorias(app, alElegir) {
  const contenedor = $('[data-categorias]');
  const t = app.textos.categorias;
  contenedor.replaceChildren(...app.catalogo.categorias.map((cat) => {
    const li = clonar('plantilla-categoria');
    const enlace = $('.categoria__enlace', li);
    if (cat.foto) $('.categoria__foto', li).append(imagen(cat.foto, { sizes: '(min-width: 768px) 46vw, 92vw', alt: '' }));
    $('.categoria__nombre', li).textContent = cat.nombre;
    $('.categoria__contador', li).textContent = contar(cat.total, t.contadorUno, t.contador);
    enlace.addEventListener('click', () => alElegir(cat.id));
    return li;
  }));
}

/** Fila de "Los más vendidos". Si no hay ninguno marcado, la sección no se muestra. */
export function pintarVendidos(app) {
  const seccion = $('[data-vendidos]');
  const vendidos = app.catalogo.productos.filter((p) => p.masVendido);
  seccion.hidden = vendidos.length === 0;
  $('[data-vendidos-lista]').replaceChildren(
    ...vendidos.map((p) => crearTarjeta(p, app, { sizes: '(min-width: 992px) 23vw, (min-width: 768px) 46vw, 74vw' })),
  );
}

/** Un solo escucha para todas las tarjetas (catálogo y más vendidos). */
export function conectarTarjetas(app) {
  const t = app.textos.pieza;
  document.addEventListener('click', (evento) => {
    const tarjeta = evento.target.closest('.pieza[data-id]');
    if (!tarjeta) return;
    const id = tarjeta.dataset.id;

    const abrir = evento.target.closest('.pieza__abrir');
    if (abrir) {
      app.detalle.abrir(id, abrir);
      return;
    }
    const anadir = evento.target.closest('[data-accion="anadir"]');
    if (anadir && app.bolsa.agregar(id)) confirmarEnBoton(anadir, t);
  });
}

/** El botón dice "Añadida a tu bolsa" un momento: confirma sin mover nada de lugar. */
export function confirmarEnBoton(boton, t) {
  const texto = $('[data-texto]', boton) ?? boton;
  clearTimeout(boton._temporizador);
  texto.textContent = t.anadida;
  boton._temporizador = setTimeout(() => { texto.textContent = t.anadir; }, 1600);
}
