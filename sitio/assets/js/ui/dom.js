/**
 * Ayudas para construir la interfaz SIN innerHTML: todo se crea con nodos y
 * textContent, así ningún dato (del catálogo, del usuario o de localStorage)
 * puede colarse como código.
 */
const SVG = 'http://www.w3.org/2000/svg';
const ANCHOS = [480, 768, 1280];

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

/** Copia el contenido de una <template> del HTML. */
export function clonar(id) {
  return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

/** Icono del archivo assets/iconos/iconos.svg. */
export function icono(nombre) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'icono');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `assets/iconos/iconos.svg#i-${nombre}`);
  svg.append(use);
  return svg;
}

/** Imagen responsiva (480, 768 y 1280 px) con carga diferida y medidas reservadas. */
export function imagen(foto, { sizes, diferida = true, alt = foto.alt } = {}) {
  const img = document.createElement('img');
  img.decoding = 'async';
  if (diferida) img.loading = 'lazy';
  img.width = foto.ancho;
  img.height = foto.alto;
  img.alt = alt;
  img.sizes = sizes;
  img.srcset = ANCHOS.map((a) => `assets/fotos/${foto.base}-${a}.webp ${a}w`).join(', ');
  img.src = `assets/fotos/${foto.base}-768.webp`;
  return img;
}

/** Mensaje para lectores de pantalla (no se ve). */
export function anunciar(texto) {
  const region = $('[data-anuncios]');
  if (!region) return;
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = texto; });
}

export const reduceMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Copia de sitio/datos/config.json y textos.json que el script de construcción deja en el HTML. */
export const datos = JSON.parse(document.getElementById('datos-sitio').textContent);

/**
 * El JavaScript de Bootstrap (ventanas, panel de la bolsa, menú, acordeón) no
 * hace falta para pintar la página, así que se carga después: al primer gesto
 * de la persona o cuando una función lo pide. Mantiene su verificación de
 * integridad. Devuelve una promesa con el objeto `bootstrap`.
 */
let cargando = null;
export function cargarBootstrap() {
  if (window.bootstrap) return Promise.resolve(window.bootstrap);
  cargando ??= new Promise((listo, error) => {
    const guion = document.createElement('script');
    guion.src = datos.bootstrap.src;
    guion.integrity = datos.bootstrap.integridad;
    guion.addEventListener('load', () => listo(window.bootstrap));
    guion.addEventListener('error', () => {
      cargando = null;
      error(new Error('No se pudo cargar Bootstrap'));
    });
    document.head.append(guion);
  });
  return cargando;
}
