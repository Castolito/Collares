/**
 * Filtros de la colección: categoría (primer nivel), material (segundo nivel,
 * depende de la categoría), búsqueda por texto y precio (solo si hay precios).
 * La lógica de qué piezas pasan está en nucleo/filtros.js.
 */
import { contarActivos, criterioVacio, filtrar, hayFiltros, materialesDe, rangoPrecios } from '../nucleo/filtros.js';
import { rellenar } from '../nucleo/texto.js';
import { $, $$, icono } from './dom.js';
import { crearTarjeta } from './catalogo.js';

// Pequeño escalonado al aparecer, con pausas que se acortan (nunca uniforme) y tope de 100 ms.
const RETRASOS = [0, 30, 55, 75, 90, 100];

const TANDA = 4;
const ceder = () => new Promise((listo) => setTimeout(listo, 0));

export async function crearFiltros(app) {
  const t = app.textos.filtros;
  const { productos, categorias } = app.catalogo;
  const criterio = criterioVacio();

  const rejilla = $('[data-rejilla]');
  const cajaCategorias = $('[data-filtro-categorias]');
  const cajaMateriales = $('[data-filtro-materiales]');
  const campoTexto = $('[data-filtro-texto]');
  const grupoPrecio = $('[data-filtro-precio]');
  const precioMin = $('[data-precio-min]');
  const precioMax = $('[data-precio-max]');
  const resultado = $('[data-filtros-resultado]');
  const activos = $('[data-filtros-activos]');
  const cuenta = $('[data-filtros-cuenta]');
  const vacio = $('[data-vacio]');

  // Las tarjetas se crean en tandas cortas, cediendo el turno entre una y otra,
  // para que la página nunca se quede sin responder mientras se arma el catálogo.
  const tarjetas = new Map();
  rejilla.replaceChildren();
  for (let i = 0; i < productos.length; i += TANDA) {
    const tanda = productos.slice(i, i + TANDA).map((p) => {
      const tarjeta = crearTarjeta(p, app);
      tarjetas.set(p.id, tarjeta);
      return tarjeta;
    });
    rejilla.append(...tanda);
    await ceder();
  }

  /* ----- controles ----- */

  function opcion(tipo, nombre, valor, texto, total) {
    const id = `filtro-${nombre}-${valor || 'todos'}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const input = document.createElement('input');
    input.type = tipo;
    input.name = nombre;
    input.value = valor;
    input.id = id;
    const label = document.createElement('label');
    label.htmlFor = id;
    if (tipo === 'radio') {
      const caja = document.createElement('div');
      caja.className = 'segmento';
      label.textContent = texto;
      caja.append(input, label);
      return caja;
    }
    label.className = 'casilla';
    const numero = document.createElement('span');
    numero.className = 'casilla__cuenta';
    numero.textContent = `(${total})`;
    label.append(input, document.createTextNode(texto), numero);
    return label;
  }

  cajaCategorias.replaceChildren(
    opcion('radio', 'categoria', '', t.todos),
    ...categorias.map((c) => opcion('radio', 'categoria', c.id, c.nombre)),
  );

  /** Los materiales mostrados dependen de la categoría elegida. */
  function pintarMateriales() {
    const disponibles = materialesDe(productos, criterio.categoria);
    criterio.materiales = criterio.materiales.filter((m) => disponibles.some((d) => d.nombre === m));
    cajaMateriales.replaceChildren(...disponibles.map((m) => {
      const casilla = opcion('checkbox', 'material', m.nombre, m.nombre, m.total);
      $('input', casilla).checked = criterio.materiales.includes(m.nombre);
      return casilla;
    }));
  }

  // El filtro de precio existe, pero solo se activa cuando algún producto tiene precio.
  const rango = rangoPrecios(productos);
  if (rango) {
    grupoPrecio.hidden = false;
    grupoPrecio.disabled = false;
    for (const campo of [precioMin, precioMax]) {
      campo.min = rango.min;
      campo.max = rango.max;
    }
    precioMin.placeholder = rango.min;
    precioMax.placeholder = rango.max;
  }

  /* ----- aplicar ----- */

  function chip(texto, alQuitar) {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'chip';
    boton.setAttribute('aria-label', rellenar(t.quitar, { nombre: texto }));
    boton.append(document.createTextNode(texto), icono('cerrar'));
    boton.addEventListener('click', () => {
      alQuitar();
      sincronizar();
      aplicar();
      // El chip desaparece: el foco pasa al siguiente o, si no quedan, al buscador de la colección.
      ($('.chip', activos) ?? campoTexto).focus();
    });
    li.append(boton);
    return li;
  }

  function aplicar() {
    const visibles = new Set(filtrar(productos, criterio).map((p) => p.id));
    let nuevas = 0;
    for (const [id, tarjeta] of tarjetas) {
      const mostrar = visibles.has(id);
      if (mostrar && tarjeta.hidden) {
        tarjeta.style.setProperty('--retraso', `${RETRASOS[Math.min(nuevas, RETRASOS.length - 1)]}ms`);
        nuevas += 1;
      } else if (mostrar) {
        tarjeta.style.removeProperty('--retraso');
      }
      tarjeta.hidden = !mostrar;
    }

    const categoria = categorias.find((c) => c.id === criterio.categoria);
    const total = categoria ? categoria.total : productos.length;
    resultado.textContent = rellenar(t.mostrando, {
      n: visibles.size,
      total,
      sustantivo: categoria ? categoria.nombre.toLocaleLowerCase('es') : t.sustantivo,
    });

    const chips = criterio.materiales.map((m) => chip(m, () => { criterio.materiales = criterio.materiales.filter((x) => x !== m); }));
    if (criterio.texto) chips.push(chip(rellenar(t.busqueda, { texto: criterio.texto }), () => { criterio.texto = ''; }));
    if (criterio.precioMin !== null || criterio.precioMax !== null) {
      chips.push(chip(`${t.precio}: ${criterio.precioMin ?? rango.min} – ${criterio.precioMax ?? rango.max}`, () => { criterio.precioMin = null; criterio.precioMax = null; }));
    }
    activos.replaceChildren(...chips);
    activos.hidden = chips.length === 0;

    const n = contarActivos(criterio);
    cuenta.textContent = n;
    cuenta.hidden = n === 0;
    for (const boton of $$('[data-filtros-limpiar]')) boton.hidden = !hayFiltros(criterio);
    vacio.hidden = visibles.size > 0;
    $('.btn', vacio).hidden = false;
  }

  /** Pone los controles de acuerdo con el criterio (tras limpiar o quitar un chip). */
  function sincronizar() {
    for (const radio of $$('input[name="categoria"]', cajaCategorias)) radio.checked = radio.value === criterio.categoria;
    pintarMateriales();
    campoTexto.value = criterio.texto;
    precioMin.value = criterio.precioMin ?? '';
    precioMax.value = criterio.precioMax ?? '';
  }

  function limpiar() {
    Object.assign(criterio, criterioVacio());
    sincronizar();
    aplicar();
  }

  /* ----- eventos ----- */

  const formulario = $('[data-filtros]');
  formulario.addEventListener('submit', (evento) => evento.preventDefault());
  formulario.addEventListener('change', (evento) => {
    const { name, value, checked } = evento.target;
    if (name === 'categoria') {
      criterio.categoria = value;
      pintarMateriales();
    } else if (name === 'material') {
      criterio.materiales = checked ? [...criterio.materiales, value] : criterio.materiales.filter((m) => m !== value);
    } else if (evento.target === precioMin || evento.target === precioMax) {
      const leer = (campo) => (campo.value === '' || !Number.isFinite(campo.valueAsNumber) ? null : Math.max(0, campo.valueAsNumber));
      criterio.precioMin = leer(precioMin);
      criterio.precioMax = leer(precioMax);
    } else {
      return;
    }
    aplicar();
  });
  campoTexto.addEventListener('input', () => {
    criterio.texto = campoTexto.value.trim().slice(0, 60);
    aplicar();
  });
  for (const boton of $$('[data-filtros-limpiar]')) {
    boton.addEventListener('click', () => {
      limpiar();
      campoTexto.focus();
    });
  }

  sincronizar();
  aplicar();

  return {
    /** La usan las tarjetas de "Compra por categoría". */
    fijarCategoria(id) {
      Object.assign(criterio, criterioVacio(), { categoria: id });
      sincronizar();
      aplicar();
    },
    /** La usa el buscador del encabezado ("Ver todo en la colección"). */
    fijarTexto(texto) {
      Object.assign(criterio, criterioVacio(), { texto: texto.trim().slice(0, 60) });
      sincronizar();
      aplicar();
    },
    limpiar,
  };
}
