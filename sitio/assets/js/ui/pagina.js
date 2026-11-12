/**
 * Comportamientos generales de la página: encabezado, menú, sección activa,
 * botón "volver arriba", aparición al hacer scroll y año del pie.
 * Nada de esto depende del catálogo.
 */
import { $, $$, cargarBootstrap, reduceMovimiento } from './dom.js';

// Escalonado de los pasos de "Cómo pedir": pausas que se acortan, como una ola y no como un metrónomo.
const ESCALON = [0, 90, 160, 210];

export function iniciarPagina() {
  const encabezado = $('[data-encabezado]');
  const arriba = $('[data-arriba]');

  /* Año del pie, siempre el actual */
  for (const nodo of $$('[data-anio]')) nodo.textContent = new Date().getFullYear();

  /* Bootstrap se pide al primer gesto (tocar, mover el ratón, usar el teclado o desplazarse) */
  const pedir = () => { cargarBootstrap().catch(() => {}); };
  for (const gesto of ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'scroll']) {
    window.addEventListener(gesto, pedir, { once: true, passive: true, capture: true });
  }
  // Si alguien toca un control de Bootstrap antes de que termine de cargar, el toque se repite al estar listo.
  document.addEventListener('click', (evento) => {
    const control = evento.target.closest?.('[data-bs-toggle], [data-bs-dismiss]');
    if (!control || window.bootstrap) return;
    evento.preventDefault();
    evento.stopPropagation();
    cargarBootstrap().then(() => control.click()).catch(() => {});
  }, true);

  /* En iOS, :active solo responde al toque si existe algún escucha táctil */
  document.addEventListener('touchstart', () => {}, { passive: true });

  /* Encabezado con filete al desplazarse y botón "volver arriba" */
  let pendiente = false;
  function alDesplazar() {
    pendiente = false;
    const y = window.scrollY;
    encabezado.classList.toggle('es-desplazado', y > 8);
    arriba.hidden = y < window.innerHeight * 0.9;
  }
  window.addEventListener('scroll', () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(alDesplazar);
  }, { passive: true });
  alDesplazar();

  arriba.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMovimiento() ? 'auto' : 'smooth' });
    $('.marca').focus({ preventScroll: true });
  });

  /* Menú de teléfono: se cierra al elegir una sección o con Escape */
  const menu = $('#menu-movil');
  const botonMenu = $('.encabezado__menu');
  const cerrarMenu = () => window.bootstrap?.Collapse.getInstance(menu)?.hide();
  menu.addEventListener('click', (evento) => {
    if (evento.target.closest('a')) cerrarMenu();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && menu.classList.contains('show')) {
      cerrarMenu();
      botonMenu.focus();
    }
  });

  /* Sección activa en el menú */
  const enlaces = $$('[data-nav]');
  const secciones = [...new Set(enlaces.map((e) => e.dataset.nav))].map((id) => document.getElementById(id)).filter(Boolean);
  if ('IntersectionObserver' in window && secciones.length) {
    const visibles = new Map();
    const espia = new IntersectionObserver((entradas) => {
      for (const e of entradas) visibles.set(e.target.id, e.isIntersecting);
      const actual = secciones.find((s) => visibles.get(s.id))?.id;
      for (const enlace of enlaces) {
        if (enlace.dataset.nav === actual) enlace.setAttribute('aria-current', 'true');
        else enlace.removeAttribute('aria-current');
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const s of secciones) espia.observe(s);
  }

  /* Aparición suave al hacer scroll.
     Solo se oculta lo que todavía está fuera de la pantalla, así nada parpadea
     al cargar y sin JavaScript todo el contenido queda visible. */
  if (!reduceMovimiento() && 'IntersectionObserver' in window) {
    for (const grupo of $$('[data-escalonar]')) {
      for (const [i, hijo] of [...grupo.children].entries()) hijo.style.setProperty('--retraso', `${ESCALON[Math.min(i, ESCALON.length - 1)]}ms`);
    }
    const revelar = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) {
          // Primera noticia de un bloque que aún está más abajo: se prepara para aparecer.
          if (e.boundingClientRect.top > 0) e.target.classList.add('por-revelar');
          continue;
        }
        revelar.unobserve(e.target);
        if (!e.target.classList.contains('por-revelar')) continue; // ya estaba a la vista: no se anima
        e.target.classList.add('revelado');
        // Al terminar se retiran las clases para no interferir con otros efectos.
        const limpiar = (evento) => {
          if (evento.target !== e.target || evento.propertyName !== 'opacity') return;
          e.target.classList.remove('por-revelar', 'revelado');
          e.target.style.removeProperty('--retraso');
          e.target.removeEventListener('transitionend', limpiar);
        };
        e.target.addEventListener('transitionend', limpiar);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    // El observador avisa de la posición de cada bloque sin obligar al navegador a medir de más.
    for (const nodo of $$('[data-revelar]')) revelar.observe(nodo);
  }
}
