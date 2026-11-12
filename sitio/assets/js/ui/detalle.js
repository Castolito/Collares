/**
 * Ventana de detalle de una pieza. Bootstrap se encarga de atrapar el foco y
 * de cerrar con Escape; aquí se llena el contenido y se devuelve el foco al
 * elemento que la abrió.
 */
import { rellenar } from '../nucleo/texto.js';
import { $, cargarBootstrap, imagen } from './dom.js';
import { confirmarEnBoton, enlacePedido, pintarPrecio } from './catalogo.js';

const TAMANOS = '(min-width: 992px) 380px, (min-width: 768px) 45vw, 92vw';

export function crearDetalle(app) {
  const t = app.textos.pieza;
  const ventana = $('#detalle');
  const marco = $('.detalle__foto', ventana);
  const miniaturas = $('[data-detalle-miniaturas]', ventana);
  const anadir = $('[data-detalle-anadir]', ventana);
  const pedir = $('[data-detalle-pedir]', ventana);
  let actual = null;
  let origen = null;

  function mostrarFoto(indice) {
    const foto = actual.fotos[indice];
    marco.replaceChildren(imagen(foto, { sizes: TAMANOS, diferida: false }));
    for (const [i, boton] of [...miniaturas.querySelectorAll('button')].entries()) {
      boton.setAttribute('aria-pressed', String(i === indice));
    }
  }

  function llenar(producto) {
    actual = producto;
    $('[data-detalle-material]', ventana).textContent = `${producto.categoria.singular} · ${producto.material}`;
    $('[data-detalle-nombre]', ventana).textContent = producto.nombreCompleto;
    $('[data-detalle-descripcion]', ventana).textContent = producto.descripcion;
    pintarPrecio($('[data-detalle-precio]', ventana), producto, app);
    $('[data-detalle-nota]', ventana).hidden = !app.config.esPrototipo;

    const lista = $('[data-detalle-caracteristicas]', ventana);
    lista.replaceChildren(...producto.caracteristicas.flatMap((c) => {
      const dt = document.createElement('dt');
      dt.textContent = c.etiqueta;
      const dd = document.createElement('dd');
      dd.textContent = c.valor;
      return [dt, dd];
    }));

    // Galería: las miniaturas solo aparecen si hay más de una foto.
    miniaturas.hidden = producto.fotos.length < 2;
    miniaturas.replaceChildren(...(producto.fotos.length < 2 ? [] : producto.fotos.map((foto, i) => {
      const li = document.createElement('li');
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'miniatura';
      boton.setAttribute('aria-label', rellenar(t.verFoto, { n: i + 1, total: producto.fotos.length }));
      boton.append(imagen(foto, { sizes: '56px', alt: '' }));
      boton.addEventListener('click', () => mostrarFoto(i));
      li.append(boton);
      return li;
    })));
    if (producto.fotos.length) mostrarFoto(0);
    else marco.replaceChildren();

    anadir.textContent = t.anadir;
    pedir.href = enlacePedido(producto, app);
    $('[data-detalle-pedir-texto]', pedir).textContent = producto.categoria.pedir;
  }

  anadir.addEventListener('click', () => {
    if (actual && app.bolsa.agregar(actual.id)) confirmarEnBoton(anadir, t);
  });

  // Al cerrar, el foco vuelve a la tarjeta (o al control) que abrió la ventana.
  ventana.addEventListener('hidden.bs.modal', () => {
    if (origen?.isConnected && origen.offsetParent !== null) origen.focus();
    origen = null;
  });
  ventana.addEventListener('shown.bs.modal', () => {
    $('.modal-body', ventana).scrollTop = 0;
  });

  return {
    abrir(id, desde = document.activeElement) {
      const producto = app.porId.get(id);
      if (!producto) return;
      origen = desde;
      llenar(producto);
      cargarBootstrap().then((bs) => bs.Modal.getOrCreateInstance(ventana).show());
    },
  };
}
