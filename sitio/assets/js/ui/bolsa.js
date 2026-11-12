/**
 * Bolsa de pedido: guarda el estado en localStorage y pinta el panel lateral.
 * Las reglas (topes, validación) viven en nucleo/bolsa.js.
 */
import { agregar, fijarCantidad, leer, quitar, serializar, totalPiezas } from '../nucleo/bolsa.js';
import { contar, rellenar } from '../nucleo/texto.js';
import { enlaceWhatsApp, mensajeBolsa } from '../nucleo/whatsapp.js';
import { $, $$, anunciar, cargarBootstrap, clonar, imagen, reduceMovimiento } from './dom.js';

export function crearBolsa(app) {
  const { config, textos: t, porId } = app;
  const tb = t.bolsa;
  const limites = { idsValidos: new Set(porId.keys()), maxPorPieza: config.bolsa.maxPorPieza, maxDistintas: config.bolsa.maxPiezasDistintas };
  const oyentes = new Set();

  const panel = $('#bolsa');
  const lista = $('[data-bolsa-lista]');
  const vacia = $('[data-bolsa-vacia]');
  const pie = $('[data-bolsa-pie]');
  const aviso = $('[data-bolsa-aviso]');
  const boton = $('[data-bolsa-boton]');
  const contador = $('[data-bolsa-contador]');
  const enviar = $('[data-bolsa-enviar]');
  const confirmar = $('[data-bolsa-confirmar]');
  const botonVaciar = $('[data-bolsa-vaciar]');

  /* ----- estado ----- */

  function leerGuardada() {
    try {
      return leer(window.localStorage.getItem(config.bolsa.clave), limites);
    } catch {
      return []; // almacenamiento bloqueado (modo privado, políticas del navegador)
    }
  }
  let items = leerGuardada();

  function guardar() {
    try {
      if (items.length) window.localStorage.setItem(config.bolsa.clave, serializar(items));
      else window.localStorage.removeItem(config.bolsa.clave);
    } catch {
      /* sin almacenamiento la bolsa sigue funcionando hasta cerrar la página */
    }
  }

  function cambiar(nuevos, { avisoTexto = '' } = {}) {
    items = nuevos;
    guardar();
    pintar(avisoTexto);
    for (const fn of oyentes) fn(api);
  }

  const lineas = () => items.map((i) => ({ id: i.id, cantidad: i.cantidad, nombre: porId.get(i.id).nombreCompleto }));

  /** Enlace y datos del pedido tal como se enviaría ahora mismo. */
  function pedido() {
    const armado = mensajeBolsa(lineas(), config);
    return { ...armado, enlace: enlaceWhatsApp(config.contacto.whatsapp, armado.mensaje) };
  }

  /* ----- pintar ----- */

  function crearItem(item) {
    const p = porId.get(item.id);
    const li = clonar('plantilla-bolsa-item');
    li.dataset.id = p.id;
    if (p.fotos[0]) $('.bolsa-item__foto', li).append(imagen(p.fotos[0], { sizes: '72px', alt: '' }));
    $('.bolsa-item__nombre', li).textContent = p.nombreCompleto;
    $('.bolsa-item__material', li).textContent = p.material;
    $('.cantidad', li).setAttribute('aria-label', rellenar(tb.cantidad, { nombre: p.nombreCompleto }));
    $('[data-cantidad]', li).textContent = item.cantidad;
    const sumar = $('[data-accion="sumar"]', li);
    sumar.setAttribute('aria-label', rellenar(tb.sumar, { nombre: p.nombreCompleto }));
    sumar.disabled = item.cantidad >= limites.maxPorPieza;
    $('[data-accion="restar"]', li).setAttribute('aria-label', rellenar(tb.restar, { nombre: p.nombreCompleto }));
    $('[data-accion="quitar"]', li).setAttribute('aria-label', rellenar(tb.quitar, { nombre: p.nombreCompleto }));
    return li;
  }

  function pintar(avisoTexto = '') {
    const total = totalPiezas(items);
    // Se recuerda qué botón tenía el foco para devolvérselo tras repintar la lista.
    const activo = document.activeElement?.closest?.('.bolsa-item');
    const foco = activo ? { id: activo.dataset.id, accion: document.activeElement.dataset.accion } : null;

    lista.replaceChildren(...items.map(crearItem));
    vacia.hidden = total > 0;
    pie.hidden = total === 0;
    confirmar.hidden = true;
    botonVaciar.hidden = false;

    contador.textContent = total > 99 ? '99+' : String(total);
    contador.hidden = total === 0;
    boton.setAttribute('aria-label', total === 0 ? tb.abrirVacia : contar(total, tb.abrirUna, tb.abrir));
    $('[data-bolsa-total]').textContent = contar(total, tb.totalUna, tb.total);

    let nota = avisoTexto;
    if (total > 0) {
      const p = pedido();
      enviar.href = p.enlace;
      if (p.omitidas > 0 && !nota) nota = rellenar(tb.mensajeLargo, { incluidas: p.incluidas, total: items.length });
    }
    aviso.textContent = nota;
    aviso.hidden = !nota;

    // Los botones "Haz tu pedido" llevan el pedido de la bolsa cuando hay piezas.
    for (const enlace of $$('[data-whatsapp="pedido"]')) {
      enlace.dataset.original ??= enlace.href;
      enlace.href = total > 0 ? pedido().enlace : enlace.dataset.original;
    }

    if (foco) {
      const destino = $(`.bolsa-item[data-id="${CSS.escape(foco.id)}"] [data-accion="${foco.accion}"]:not([disabled])`, lista)
        ?? $(`.bolsa-item[data-id="${CSS.escape(foco.id)}"] [data-accion]:not([disabled])`, lista)
        ?? $('.bolsa-item [data-accion]:not([disabled])', lista)
        ?? $('[data-bolsa-coleccion]');
      destino?.focus();
    }
  }

  function latir() {
    if (reduceMovimiento() || !contador.animate) return;
    contador.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    );
  }

  /* ----- acciones ----- */

  const api = {
    items: () => items,
    total: () => totalPiezas(items),
    pedido,
    suscribir: (fn) => oyentes.add(fn),
    abrir: () => cargarBootstrap().then((bs) => bs.Offcanvas.getOrCreateInstance(panel).show()),

    /** Añade una unidad. Devuelve true si se pudo. */
    agregar(id) {
      const p = porId.get(id);
      const r = agregar(items, id, limites);
      if (r.resultado === 'maximo' || r.resultado === 'llena') {
        const texto = r.resultado === 'maximo' ? rellenar(tb.maximo, { max: limites.maxPorPieza }) : rellenar(tb.maximoDistintas, { max: limites.maxDistintas });
        pintar(texto);
        anunciar(texto);
        api.abrir();
        return false;
      }
      if (r.resultado === 'desconocida') return false;
      cambiar(r.items);
      latir();
      anunciar(rellenar(tb.anuncioAnadida, { nombre: p.nombreCompleto, n: totalPiezas(r.items) }));
      return true;
    },
  };

  lista.addEventListener('click', (evento) => {
    const control = evento.target.closest('[data-accion]');
    const fila = control?.closest('.bolsa-item');
    if (!fila) return;
    const id = fila.dataset.id;
    const p = porId.get(id);
    const actual = items.find((i) => i.id === id)?.cantidad ?? 0;
    if (control.dataset.accion === 'quitar' || (control.dataset.accion === 'restar' && actual <= 1)) {
      cambiar(quitar(items, id));
      anunciar(items.length ? rellenar(tb.anuncioQuitada, { nombre: p.nombreCompleto }) : tb.anuncioVacia);
      return;
    }
    const r = fijarCantidad(items, id, actual + (control.dataset.accion === 'sumar' ? 1 : -1), limites);
    const tope = r.items.find((i) => i.id === id)?.cantidad >= limites.maxPorPieza;
    cambiar(r.items, { avisoTexto: tope ? rellenar(tb.maximo, { max: limites.maxPorPieza }) : '' });
    anunciar(rellenar(tb.anuncioCantidad, { nombre: p.nombreCompleto, cantidad: r.items.find((i) => i.id === id)?.cantidad ?? 0 }));
  });

  // Vaciar pide confirmación en el mismo lugar, sin ventanas emergentes.
  botonVaciar.addEventListener('click', () => {
    botonVaciar.hidden = true;
    confirmar.hidden = false;
    $('[data-bolsa-no]').focus();
  });
  $('[data-bolsa-no]').addEventListener('click', () => {
    confirmar.hidden = true;
    botonVaciar.hidden = false;
    botonVaciar.focus();
  });
  $('[data-bolsa-si]').addEventListener('click', () => {
    cambiar([]);
    anunciar(tb.anuncioVacia);
    $('[data-bolsa-coleccion]').focus();
  });

  $('[data-bolsa-coleccion]').addEventListener('click', () => {
    panel.addEventListener('hidden.bs.offcanvas', () => {
      const destino = $('#coleccion');
      destino.scrollIntoView();
      $('[data-filtro-texto]')?.focus({ preventScroll: true });
    }, { once: true });
    cargarBootstrap().then((bs) => bs.Offcanvas.getOrCreateInstance(panel).hide());
  });

  // Si la bolsa cambia en otra pestaña, esta se pone al día.
  window.addEventListener('storage', (evento) => {
    if (evento.key !== null && evento.key !== config.bolsa.clave) return;
    items = leerGuardada();
    pintar();
    for (const fn of oyentes) fn(api);
  });

  guardar(); // reescribe lo leído ya saneado
  pintar();
  return api;
}
