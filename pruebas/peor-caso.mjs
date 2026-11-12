/**
 * Prueba de "peor caso realista" de datos: nombres y categorías muy largos,
 * piezas sin foto ni descripción, una categoría nueva con una sola pieza y
 * productos con precio. Los datos se sustituyen en la frontera (la petición a
 * productos.json), sin tocar la página.
 *
 *   PRUEBAS_DEPS=/ruta/a/node_modules node pruebas/peor-caso.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const requerir = createRequire(path.join(process.env.PRUEBAS_DEPS ?? path.join(AQUI, 'node_modules'), 'x.js'));
const { chromium } = requerir('playwright-core');
const URL_BASE = process.argv[2] ?? 'http://localhost:4173/Collares/';
const CAPTURAS = path.join(AQUI, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

const peor = {
  productos: [
    {
      id: 'collar-largo', categoria: 'Collares', nombre: 'Wolfeschlegelsteinhausenbergerdorff de la Santísima Trinidad',
      material: ['Perlas barrocas de agua dulce', 'Lapislázuli'], descripcion: 'Descripción muy larga. '.repeat(25), precio: 12849.5, masVendido: true,
      fotos: [{ base: 'ejemplo-collar-perlas', alt: 'Foto de ejemplo: collar de perlas blancas.' }],
      caracteristicas: [{ etiqueta: 'Tipo de piedra o perla utilizada', valor: 'Perla barroca de agua dulce con lapislázuli afgano' }],
    },
    { id: 'jo', categoria: 'Collares', nombre: 'Jo', material: 'Ámbar', descripcion: '', precio: null, fotos: [], caracteristicas: [] },
    {
      id: 'pulsera-unica', categoria: 'Pulseras y brazaletes artesanales', nombre: 'Señorita Ñandú 日本語 🌸', material: 'Supercalifragilisticoespialidoso',
      descripcion: 'x', precio: 1, fotos: [{ base: 'no-existe', alt: 'Foto que falta' }], caracteristicas: [],
    },
  ],
};

let fallas = 0;
function comprobar(nombre, ok, detalle = '') {
  if (!ok) fallas += 1;
  console.log(`${ok ? '  ok ' : ' FALLA'}  ${nombre}${!ok && detalle ? `  (${detalle})` : ''}`);
}

let navegador;
for (const channel of ['chrome', 'msedge']) {
  try { navegador = await chromium.launch({ channel }); break; } catch { /* probar el siguiente */ }
}

for (const ancho of [360, 1280]) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 800 }, reducedMotion: 'reduce', locale: 'es-MX' });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  await pagina.route('**/datos/productos.json', (ruta) => ruta.fulfill({ json: peor }));
  await pagina.goto(URL_BASE);
  await pagina.waitForSelector('.rejilla .pieza[data-id]');
  const m = await pagina.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ancho: document.documentElement.clientWidth,
    categorias: [...document.querySelectorAll('.categoria__contador')].map((e) => e.textContent).join('|'),
    precio: document.querySelector('.pieza[data-id="collar-largo"] .pieza__precio').textContent,
    filtroPrecio: !document.querySelector('[data-filtro-precio]').hidden,
    fuera: [...document.querySelectorAll('.pieza, .categoria, .categoria__texto, .chip, .casilla, .segmento, .pieza__nombre')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && !e.closest('.vendidos');
    }).length,
  }));
  comprobar(`${ancho}px: sin desbordes con nombres y categorías muy largos`, m.scroll <= m.ancho && m.fuera === 0 && errores.length === 0, JSON.stringify(m) + errores.join(';'));
  comprobar(`${ancho}px: la categoría nueva aparece sola; contadores en singular y plural`, m.categorias === '2 piezas|1 pieza', m.categorias);
  comprobar(`${ancho}px: con precios se muestra el precio y se activa el filtro de precio`, m.precio.includes('12,849.50') && m.filtroPrecio, m.precio);

  await pagina.locator('.rejilla .pieza[data-id="collar-largo"] .pieza__abrir').click();
  await pagina.waitForSelector('#detalle.show');
  await pagina.waitForTimeout(300);
  const fuera = await pagina.evaluate(() => [...document.querySelectorAll('#detalle .modal-content *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length);
  comprobar(`${ancho}px: el detalle no se desborda`, fuera === 0, `${fuera} elementos fuera`);
  await pagina.screenshot({ path: path.join(CAPTURAS, `peor-caso-detalle-${ancho}.png`) });
  await pagina.keyboard.press('Escape');
  await pagina.waitForSelector('#detalle', { state: 'hidden' });

  await pagina.locator('#filtro-categoria-pulseras-y-brazaletes-artesanales').check({ force: true });
  if (ancho < 992) { await pagina.locator('.filtros__alternar').click(); await pagina.waitForTimeout(450); }
  await pagina.locator('.casilla').first().click();
  comprobar(`${ancho}px: filtrar por la categoría nueva y su material`, (await pagina.locator('.rejilla .pieza[data-id]:not([hidden])').count()) === 1 && (await pagina.locator('.chip').count()) === 1);
  const chipFuera = await pagina.evaluate(() => document.querySelector('.chip').getBoundingClientRect().right > document.documentElement.clientWidth);
  comprobar(`${ancho}px: la etiqueta de un material larguísimo no se sale`, !chipFuera);
  await pagina.locator('.filtros__estado [data-filtros-limpiar]').click();
  await pagina.locator('[data-precio-max]').fill('100');
  await pagina.locator('[data-precio-max]').blur();
  comprobar(`${ancho}px: el filtro de precio deja solo las piezas dentro del rango`, (await pagina.locator('.rejilla .pieza[data-id]:not([hidden])').count()) === 1);
  await pagina.locator('.filtros__estado [data-filtros-limpiar]').click();
  await pagina.screenshot({ path: path.join(CAPTURAS, `peor-caso-${ancho}.png`), fullPage: true });
  await contexto.close();
}

await navegador.close();
console.log(fallas ? `\n${fallas} falla(s).` : '\nPeor caso: todo se sostiene.');
process.exitCode = fallas ? 1 : 0;
