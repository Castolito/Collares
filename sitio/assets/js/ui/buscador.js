/**
 * Buscador del encabezado: la lupa abre un campo que busca por nombre,
 * material y categoría mientras se escribe. Sigue el patrón accesible de
 * "combobox" con lista: flechas para moverse, Enter para abrir, Escape para cerrar.
 */
import { buscar } from '../nucleo/filtros.js';
import { contar, rellenar } from '../nucleo/texto.js';
import { $, $$, clonar, imagen } from './dom.js';

export function crearBuscador(app) {
  const t = app.textos.buscador;
  const panel = $('#buscador');
  const abrir = $('[data-buscador-abrir]');
  const campo = $('#buscador-campo');
  const lista = $('#buscador-resultados');
  const estado = $('[data-buscador-estado]');
  let activa = -1;

  const opciones = () => $$('[role="option"]', lista);

  function marcar(indice) {
    const todas = opciones();
    activa = todas.length ? (indice + todas.length) % todas.length : -1;
    for (const [i, o] of todas.entries()) o.setAttribute('aria-selected', String(i === activa));
    if (activa >= 0) {
      campo.setAttribute('aria-activedescendant', todas[activa].id);
      todas[activa].scrollIntoView({ block: 'nearest' });
    } else {
      campo.removeAttribute('aria-activedescendant');
    }
  }

  function pintar() {
    const texto = campo.value.trim();
    const { resultados, total } = buscar(app.catalogo.productos, texto);
    const nodos = resultados.map((p, i) => {
      const li = clonar('plantilla-resultado');
      li.id = `resultado-${i}`;
      li.dataset.id = p.id;
      if (p.fotos[0]) $('.resultado__foto', li).append(imagen(p.fotos[0], { sizes: '44px', alt: '' }));
      $('.resultado__nombre', li).textContent = p.nombreCompleto;
      $('.resultado__detalle', li).textContent = p.material;
      return li;
    });
    if (total > 0) {
      const todos = document.createElement('li');
      todos.className = 'resultado resultado--todos';
      todos.id = 'resultado-todos';
      todos.setAttribute('role', 'option');
      todos.setAttribute('aria-selected', 'false');
      todos.dataset.todos = '';
      todos.textContent = `${t.verTodos} (${total})`;
      nodos.push(todos);
    }
    lista.replaceChildren(...nodos);
    lista.hidden = nodos.length === 0;
    campo.setAttribute('aria-expanded', String(nodos.length > 0));
    estado.textContent = !texto ? '' : total === 0 ? rellenar(t.sinResultados, { texto }) : contar(total, t.unResultado, t.resultados);
    activa = -1;
    campo.removeAttribute('aria-activedescendant');
  }

  function cerrar({ devolverFoco = true } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    abrir.setAttribute('aria-expanded', 'false');
    campo.setAttribute('aria-expanded', 'false');
    if (devolverFoco) abrir.focus();
  }

  function elegir(opcion) {
    if (!opcion) return;
    if ('todos' in opcion.dataset) {
      app.filtros.fijarTexto(campo.value);
      cerrar({ devolverFoco: false });
      $('#coleccion').scrollIntoView();
      $('[data-filtro-texto]').focus({ preventScroll: true });
      return;
    }
    const id = opcion.dataset.id;
    cerrar({ devolverFoco: false });
    app.detalle.abrir(id, abrir);
  }

  abrir.addEventListener('click', () => {
    if (!panel.hidden) return cerrar();
    panel.hidden = false;
    abrir.setAttribute('aria-expanded', 'true');
    pintar();
    campo.focus();
    campo.select();
  });
  $('[data-buscador-cerrar]').addEventListener('click', () => cerrar());

  campo.addEventListener('input', pintar);
  campo.addEventListener('keydown', (evento) => {
    const teclas = { ArrowDown: () => marcar(activa + 1), ArrowUp: () => marcar(activa < 0 ? -1 : activa - 1), Home: () => marcar(0), End: () => marcar(-1) };
    if (evento.key === 'Escape') {
      evento.preventDefault();
      cerrar();
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      const todas = opciones();
      elegir(todas[activa] ?? todas[0]);
    } else if (teclas[evento.key] && opciones().length && !((evento.key === 'Home' || evento.key === 'End') && activa < 0)) {
      evento.preventDefault();
      teclas[evento.key]();
    }
  });

  // mousedown evita que el campo pierda el foco antes de registrar el clic.
  lista.addEventListener('mousedown', (evento) => evento.preventDefault());
  lista.addEventListener('click', (evento) => elegir(evento.target.closest('[role="option"]')));

  // Tocar fuera del buscador lo cierra.
  document.addEventListener('pointerdown', (evento) => {
    if (!panel.hidden && !panel.contains(evento.target) && !abrir.contains(evento.target)) cerrar({ devolverFoco: false });
  });

  return { cerrar };
}
