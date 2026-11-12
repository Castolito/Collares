/**
 * Pruebas en un navegador real: capturas en 9 anchos, flujos completos
 * (bolsa, filtros, ventana, buscador, menú, formulario, WhatsApp),
 * accesibilidad con axe y control de recursos externos y errores de consola.
 *
 * Necesita herramientas que NO forman parte del sitio: playwright-core y
 * axe-core, y Chrome o Edge instalados. Ver README, "Pruebas".
 *
 *   node herramientas/servidor.mjs                 (en otra terminal)
 *   PRUEBAS_DEPS=/ruta/a/node_modules node pruebas/navegador.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const requerir = createRequire(path.join(process.env.PRUEBAS_DEPS ?? path.join(AQUI, 'node_modules'), 'x.js'));
const { chromium } = requerir('playwright-core');
const axeFuente = fs.readFileSync(requerir.resolve('axe-core/axe.min.js'), 'utf8');

const URL_BASE = process.argv[2] ?? 'http://localhost:4173/Collares/';
const CAPTURAS = path.join(AQUI, 'capturas');
const ANCHOS = [360, 390, 430, 768, 820, 1024, 1280, 1440, 1920];
fs.mkdirSync(CAPTURAS, { recursive: true });

const resultados = [];
const problemas = [];
function comprobar(nombre, condicion, detalle = '') {
  resultados.push({ nombre, ok: Boolean(condicion) });
  if (!condicion) problemas.push(`${nombre}${detalle ? ` -> ${detalle}` : ''}`);
  console.log(`${condicion ? '  ok ' : ' FALLA'}  ${nombre}${!condicion && detalle ? `  (${detalle})` : ''}`);
}

async function lanzar() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel }); } catch { /* probar el siguiente */ }
  }
  throw new Error('No se encontró Chrome ni Edge.');
}

const navegador = await lanzar();
const origen = new URL(URL_BASE).origin;

/** Página nueva que anota errores de consola, peticiones fallidas y recursos externos. */
async function abrir({ ancho = 1280, alto = 900, esquema = 'light', movimiento = 'reduce', tactil = false, js = true, sinCsp = false } = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: ancho, height: alto }, colorScheme: esquema, reducedMotion: movimiento,
    hasTouch: tactil, isMobile: tactil, javaScriptEnabled: js, bypassCSP: sinCsp, locale: 'es-MX',
  });
  const pagina = await contexto.newPage();
  const registro = { consola: [], externos: [], fallidas: [] };
  pagina.on('console', (m) => { if (['error', 'warning'].includes(m.type())) registro.consola.push(`${m.type()}: ${m.text()}`); });
  pagina.on('pageerror', (e) => registro.consola.push(`excepción: ${e.message}`));
  pagina.on('request', (r) => { const u = r.url(); if (!u.startsWith(origen) && !u.startsWith('data:') && !u.startsWith('about:')) registro.externos.push(u); });
  pagina.on('requestfailed', (r) => registro.fallidas.push(`${r.url()} ${r.failure()?.errorText}`));
  pagina.on('response', (r) => { if (r.status() >= 400) registro.fallidas.push(`${r.status()} ${r.url()}`); });
  await pagina.goto(URL_BASE, { waitUntil: 'load' });
  if (js) await pagina.waitForSelector('.rejilla .pieza[data-id]');
  return { pagina, contexto, registro };
}

async function recorrer(pagina) {
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await pagina.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {});
  await pagina.waitForTimeout(300);
}

async function axe(pagina, etiqueta) {
  await pagina.addScriptTag({ content: axeFuente });
  const r = await pagina.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return res.violations.map((v) => `${v.id} [${v.impact}] ${v.nodes.length}x: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  comprobar(`axe sin hallazgos: ${etiqueta}`, r.length === 0, r.join(' ;; '));
}

/* ================= 1. Capturas y desbordes en los 9 anchos ================= */
console.log('\n[1] Capturas en 9 anchos');
for (const ancho of ANCHOS) {
  const { pagina, contexto, registro } = await abrir({ ancho, alto: ancho < 768 ? 800 : 900, tactil: ancho < 1024 });
  await recorrer(pagina);
  const medidas = await pagina.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('body *')].filter((e) => {
      if (e.closest('.vendidos, .offcanvas, .modal, .trampa, .visually-hidden, .saltar')) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > ancho + 1 || r.left < -1);
    }).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${String(e.className.baseVal ?? e.className).split(' ')[0]}`);
    return { scroll: document.documentElement.scrollWidth, ancho, fuera, columnas: getComputedStyle(document.querySelector('.rejilla')).gridTemplateColumns.split(' ').length };
  });
  comprobar(`${ancho}px sin scroll horizontal`, medidas.scroll <= medidas.ancho && medidas.fuera.length === 0, `scrollWidth ${medidas.scroll}; fuera: ${medidas.fuera.join(', ')}`);
  const esperadas = ancho < 420 ? 1 : ancho < 992 ? 2 : ancho < 1400 ? 3 : 4;
  comprobar(`${ancho}px rejilla de ${esperadas} columna(s)`, medidas.columnas === esperadas, `tiene ${medidas.columnas}`);
  await pagina.screenshot({ path: path.join(CAPTURAS, `ancho-${ancho}.png`), fullPage: true });
  await pagina.screenshot({ path: path.join(CAPTURAS, `inicio-${ancho}.png`) });
  comprobar(`${ancho}px sin errores de consola ni recursos externos`, registro.consola.length + registro.externos.length + registro.fallidas.length === 0, [...registro.consola, ...registro.externos, ...registro.fallidas].slice(0, 4).join(' ;; '));
  await contexto.close();
}

/* ================= 2. WhatsApp ================= */
console.log('\n[2] Enlaces de WhatsApp');
{
  const { pagina, contexto } = await abrir();
  const enlaces = await pagina.evaluate(() => [...document.querySelectorAll('a[href^="https://wa.me/"]')].map((a) => ({ href: a.href, tipo: a.dataset.whatsapp ?? a.dataset.accion ?? '', rel: a.rel, target: a.target, id: a.closest('.pieza')?.dataset.id ?? '' })));
  const texto = (e) => new URL(e.href).searchParams.get('text');
  comprobar('hay enlaces de WhatsApp en toda la página', enlaces.length >= 26, `${enlaces.length}`);
  comprobar('todos abren en pestaña nueva con rel="noopener noreferrer"', enlaces.every((e) => e.target === '_blank' && e.rel.includes('noopener') && e.rel.includes('noreferrer')));
  comprobar('los generales llevan "Hola, me interesa un collar"', enlaces.filter((e) => e.tipo === 'general').every((e) => texto(e) === 'Hola, me interesa un collar') && enlaces.some((e) => e.tipo === 'general'));
  comprobar('"Haz tu pedido" (bolsa vacía) lleva el mensaje de pedido', enlaces.filter((e) => e.tipo === 'pedido').every((e) => texto(e) === 'Hola, quiero hacer un pedido.'));
  const luna = enlaces.find((e) => e.id === 'collar-luna-de-agua' && e.tipo === 'pedir');
  const lavanda = enlaces.find((e) => e.id === 'aretes-lavanda' && e.tipo === 'pedir');
  comprobar('"Pedir este collar" nombra la pieza', luna && texto(luna) === 'Hola, me interesa el collar Luna de Agua. ¿Me das más información?', luna && texto(luna));
  comprobar('"Pedir estos aretes" nombra la pieza', lavanda && texto(lavanda) === 'Hola, me interesan los aretes Lavanda. ¿Me das más información?', lavanda && texto(lavanda));
  comprobar('el mensaje va codificado en la URL', luna && luna.href.includes('%C2%BF') && !luna.href.includes(' '));
  const etiquetas = await pagina.evaluate(() => ({ collar: document.querySelector('.pieza[data-id="collar-rocio"] [data-accion="pedir"] [data-texto]').textContent, aretes: document.querySelector('.pieza[data-id="aretes-brisa"] [data-accion="pedir"] [data-texto]').textContent }));
  comprobar('el botón dice "Pedir este collar" / "Pedir estos aretes" según la categoría', etiquetas.collar === 'Pedir este collar' && etiquetas.aretes === 'Pedir estos aretes');
  await contexto.close();
}

/* ================= 3. Bolsa ================= */
console.log('\n[3] Bolsa');
{
  const { pagina, contexto, registro } = await abrir();
  const contador = () => pagina.locator('[data-bolsa-contador]');
  await pagina.locator('.rejilla .pieza[data-id="collar-rocio"] [data-accion="anadir"]').click();
  comprobar('añadir suma 1 al contador', (await contador().textContent()) === '1');
  comprobar('el botón confirma "Añadida a tu bolsa"', (await pagina.locator('.rejilla .pieza[data-id="collar-rocio"] [data-accion="anadir"]').textContent()).trim() === 'Añadida a tu bolsa');
  await pagina.locator('.rejilla .pieza[data-id="collar-rocio"] [data-accion="anadir"]').click();
  await pagina.locator('.rejilla .pieza[data-id="aretes-miel"] [data-accion="anadir"]').click();
  comprobar('el contador suma todas las unidades', (await contador().textContent()) === '3');
  const guardado = await pagina.evaluate(() => localStorage.getItem('collares.bolsa.v1'));
  comprobar('localStorage guarda solo identificadores y cantidades', guardado === '{"v":1,"items":[["collar-rocio",2],["aretes-miel",1]]}', guardado);

  await pagina.locator('[data-bolsa-boton]').click();
  await pagina.waitForSelector('#bolsa.show');
  await pagina.waitForTimeout(450);
  const enviar = async () => new URL(await pagina.locator('[data-bolsa-enviar]').getAttribute('href')).searchParams.get('text');
  comprobar('el pedido lista piezas y cantidades', (await enviar()) === 'Hola, quiero hacer este pedido: 2 x Collar Rocío, 1 x Aretes Miel', await enviar());
  comprobar('"Haz tu pedido" del encabezado lleva la bolsa', new URL(await pagina.locator('.encabezado__pedido').getAttribute('href')).searchParams.get('text') === await enviar());
  comprobar('el foco entra al panel de la bolsa', await pagina.evaluate(() => document.querySelector('#bolsa').contains(document.activeElement)));

  const fila = pagina.locator('.bolsa-item[data-id="collar-rocio"]');
  await fila.locator('[data-accion="sumar"]').click();
  comprobar('sumar una unidad', (await fila.locator('[data-cantidad]').textContent()) === '3');
  comprobar('el foco se queda en el botón de sumar', await pagina.evaluate(() => document.activeElement?.dataset.accion === 'sumar'));
  for (let i = 0; i < 12; i++) if (await fila.locator('[data-accion="sumar"]').isEnabled()) await fila.locator('[data-accion="sumar"]').click();
  comprobar('la cantidad se detiene en el máximo (10)', (await fila.locator('[data-cantidad]').textContent()) === '10' && await fila.locator('[data-accion="sumar"]').isDisabled());
  comprobar('avisa del máximo por pieza', (await pagina.locator('[data-bolsa-aviso]').textContent()).includes('Máximo 10'));
  await fila.locator('[data-accion="restar"]').click();
  comprobar('restar una unidad', (await fila.locator('[data-cantidad]').textContent()) === '9');
  await pagina.locator('.bolsa-item[data-id="aretes-miel"] [data-accion="restar"]').click();
  comprobar('restar la última unidad quita la pieza', (await pagina.locator('.bolsa-item').count()) === 1);
  comprobar('tras quitar, el foco sigue dentro de la bolsa', await pagina.evaluate(() => document.querySelector('#bolsa').contains(document.activeElement)));

  await pagina.reload();
  await pagina.waitForSelector('.rejilla .pieza[data-id]');
  comprobar('la bolsa se conserva al recargar', (await contador().textContent()) === '9');

  // Casos límite: localStorage dañado o manipulado
  await pagina.evaluate(() => localStorage.setItem('collares.bolsa.v1', '{"v":1,"items":[["collar-alba",99999],["<img src=x onerror=alert(1)>",1],["no-existe",2],["aretes-brote","3"]],"extra":"<script>"}'));
  await pagina.reload();
  await pagina.waitForSelector('.rejilla .pieza[data-id]');
  comprobar('datos manipulados en localStorage se sanean', (await contador().textContent()) === '10' && (await pagina.evaluate(() => localStorage.getItem('collares.bolsa.v1'))) === '{"v":1,"items":[["collar-alba",10]]}');
  await pagina.evaluate(() => localStorage.setItem('collares.bolsa.v1', 'esto no es json {{{'));
  await pagina.reload();
  await pagina.waitForSelector('.rejilla .pieza[data-id]');
  comprobar('localStorage dañado deja la bolsa vacía sin errores', await contador().isHidden() && registro.consola.length === 0, registro.consola.join(';'));

  // Mensaje muy largo: las 20 piezas con 10 unidades
  await pagina.evaluate(() => { const ids = [...document.querySelectorAll('.rejilla .pieza[data-id]')].map((p) => p.dataset.id); localStorage.setItem('collares.bolsa.v1', JSON.stringify({ v: 1, items: ids.map((id) => [id, 10]) })); });
  await pagina.reload();
  await pagina.waitForSelector('.rejilla .pieza[data-id]');
  await pagina.locator('[data-bolsa-boton]').click();
  await pagina.waitForSelector('#bolsa.show');
  const largo = await enviar();
  comprobar('un pedido de 200 unidades arma un mensaje dentro del límite', largo.length <= 1200 && (await contador().textContent()) === '99+', `${largo.length} caracteres`);

  // Vaciar con confirmación
  await pagina.locator('[data-bolsa-vaciar]').click();
  comprobar('vaciar pide confirmación', await pagina.locator('[data-bolsa-confirmar]').isVisible());
  await pagina.locator('[data-bolsa-si]').click();
  comprobar('bolsa vacía con mensaje amable', await pagina.locator('[data-bolsa-vacia]').isVisible() && await pagina.locator('[data-bolsa-pie]').isHidden() && (await pagina.evaluate(() => localStorage.getItem('collares.bolsa.v1'))) === null);
  await pagina.keyboard.press('Escape');
  await pagina.waitForSelector('#bolsa', { state: 'hidden' });
  comprobar('Escape cierra la bolsa y devuelve el foco a su botón', await pagina.evaluate(() => document.activeElement?.hasAttribute('data-bolsa-boton')));
  await contexto.close();
}

/* ================= 4. Filtros ================= */
console.log('\n[4] Filtros');
{
  const { pagina, contexto } = await abrir();
  const visibles = () => pagina.locator('.rejilla .pieza[data-id]:not([hidden])').count();
  const estado = async () => (await pagina.locator('[data-filtros-resultado]').textContent()).trim();
  comprobar('sin filtros se muestran las 20 piezas', (await visibles()) === 20 && (await estado()) === 'Mostrando 20 de 20 piezas', await estado());
  await pagina.locator('#filtro-categoria-aretes').click();
  comprobar('filtro por categoría con contador', (await visibles()) === 10 && (await estado()) === 'Mostrando 10 de 10 aretes', await estado());
  await pagina.locator('.casilla', { hasText: 'Perlas' }).click();
  await pagina.locator('.casilla', { hasText: 'Turquesa' }).click();
  comprobar('varias casillas: coincide con cualquiera', (await visibles()) === 4 && (await estado()) === 'Mostrando 4 de 10 aretes', await estado());
  comprobar('etiquetas activas y botón de limpiar', (await pagina.locator('.chip').count()) === 2 && await pagina.locator('.filtros__estado [data-filtros-limpiar]').isVisible());
  await pagina.locator('.chip', { hasText: 'Perlas' }).click();
  comprobar('una etiqueta se quita con un clic', (await visibles()) === 1 && (await pagina.locator('.chip').count()) === 1);
  await pagina.locator('#filtro-categoria-collares').click();
  comprobar('los materiales dependen de la categoría', (await pagina.locator('.casilla').count()) === 8 && (await visibles()) === 1, `${await pagina.locator('.casilla').count()} casillas, ${await visibles()} visibles`);
  await pagina.locator('[data-filtro-texto]').fill('zzzz');
  comprobar('sin resultados: mensaje amable con opción de limpiar', await pagina.locator('[data-vacio]').isVisible() && (await visibles()) === 0);
  await pagina.locator('[data-vacio] [data-filtros-limpiar]').click();
  comprobar('limpiar filtros restaura todo', (await visibles()) === 20 && (await pagina.locator('.chip').count()) === 0);
  await pagina.locator('[data-filtro-texto]').fill('ágata');
  comprobar('búsqueda en la colección sin importar acentos', (await visibles()) === 2);
  comprobar('el filtro de precio está oculto mientras no hay precios', await pagina.locator('[data-filtro-precio]').isHidden());
  comprobar('el contador de resultados se anuncia a lectores de pantalla', (await pagina.locator('[data-filtros-resultado]').getAttribute('role')) === 'status');
  // Solo con teclado
  await pagina.locator('[data-filtro-texto]').fill('');
  await pagina.locator('#filtro-categoria-todos').focus();
  await pagina.keyboard.press('ArrowRight');
  comprobar('categoría con flechas del teclado', (await estado()) === 'Mostrando 10 de 10 collares', await estado());
  await pagina.keyboard.press('Tab');
  await pagina.keyboard.press('Tab');
  await pagina.keyboard.press('Space');
  comprobar('casilla de material con Tab y Espacio', (await pagina.locator('.chip').count()) === 1, await estado());
  // Tarjeta de categoría
  await pagina.locator('.categoria__enlace').nth(1).click();
  await pagina.waitForTimeout(200);
  comprobar('"Compra por categoría" lleva al catálogo ya filtrado', (await estado()) === 'Mostrando 10 de 10 aretes' && pagina.url().endsWith('#coleccion'), await estado());
  await contexto.close();
}
{
  const { pagina, contexto } = await abrir({ ancho: 390, alto: 800, tactil: true });
  comprobar('teléfono: materiales plegados tras el botón "Filtrar"', await pagina.locator('.filtros__alternar').isVisible() && await pagina.locator('#filtros-panel').isHidden());
  await pagina.locator('.filtros__alternar').tap();
  await pagina.waitForSelector('#filtros-panel.show');
  await pagina.locator('.casilla', { hasText: 'Amatista' }).tap();
  comprobar('teléfono: filtrar al toque y contador en el botón', (await pagina.locator('[data-filtros-cuenta]').textContent()) === '1' && (await pagina.locator('.rejilla .pieza[data-id]:not([hidden])').count()) === 2);
  await contexto.close();
}

/* ================= 5. Ventana de detalle ================= */
console.log('\n[5] Ventana de detalle');
for (const [nombre, opciones] of [['escritorio', {}], ['teléfono', { ancho: 390, alto: 800, tactil: true }]]) {
  const { pagina, contexto } = await abrir(opciones);
  const disparador = pagina.locator('.rejilla .pieza[data-id="collar-luna-de-agua"] .pieza__abrir');
  await disparador.focus();
  await pagina.keyboard.press('Enter');
  await pagina.waitForSelector('#detalle.show');
  await pagina.waitForTimeout(450);
  const datos = await pagina.evaluate(() => ({
    titulo: document.querySelector('#detalle-titulo').textContent,
    filas: document.querySelectorAll('.detalle__caracteristicas dt').length,
    minis: document.querySelectorAll('.miniatura').length,
    precio: document.querySelector('[data-detalle-precio]').textContent,
    rol: document.querySelector('#detalle').getAttribute('role'), modal: document.querySelector('#detalle').getAttribute('aria-modal'),
    dentro: document.querySelector('#detalle').contains(document.activeElement),
    cabe: (() => { const r = document.querySelector('#detalle .modal-content').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })(),
  }));
  comprobar(`${nombre}: muestra nombre, características, precio y galería`, datos.titulo === 'Collar Luna de Agua' && datos.filas === 5 && datos.minis === 2 && datos.precio === 'Consulta precio por WhatsApp', JSON.stringify(datos));
  comprobar(`${nombre}: es un diálogo modal, con el foco dentro y sin cortarse`, datos.rol === 'dialog' && datos.modal === 'true' && datos.dentro && datos.cabe, JSON.stringify(datos));
  for (let i = 0; i < 14; i++) await pagina.keyboard.press('Tab');
  comprobar(`${nombre}: el foco queda atrapado en la ventana`, await pagina.evaluate(() => document.querySelector('#detalle').contains(document.activeElement)));
  await pagina.locator('.miniatura').nth(1).click();
  comprobar(`${nombre}: la galería cambia de foto`, (await pagina.locator('.detalle__foto img').getAttribute('src')).includes('ejemplo-portada-perlas-madera'));
  await pagina.locator('[data-detalle-anadir]').click();
  comprobar(`${nombre}: "Añadir a mi bolsa" desde el detalle`, (await pagina.locator('[data-bolsa-contador]').textContent()) === '1');
  if (nombre === 'teléfono') await pagina.screenshot({ path: path.join(CAPTURAS, 'detalle-390.png') });
  else await pagina.screenshot({ path: path.join(CAPTURAS, 'detalle-1280.png') });
  await pagina.keyboard.press('Escape');
  await pagina.waitForSelector('#detalle', { state: 'hidden' });
  comprobar(`${nombre}: Escape cierra y el foco vuelve a la pieza`, await pagina.evaluate(() => document.activeElement?.classList.contains('pieza__abrir') && document.activeElement.closest('.pieza').dataset.id === 'collar-luna-de-agua'));
  await disparador.click();
  await pagina.waitForSelector('#detalle.show');
  await pagina.locator('.detalle__cerrar').click();
  await pagina.waitForSelector('#detalle', { state: 'hidden' });
  comprobar(`${nombre}: se cierra con el botón visible`, true);
  await contexto.close();
}

/* ================= 6. Buscador y menú ================= */
console.log('\n[6] Buscador y menú');
{
  const { pagina, contexto } = await abrir();
  await pagina.locator('[data-buscador-abrir]').click();
  comprobar('la lupa abre el campo y le da el foco', await pagina.evaluate(() => document.activeElement?.id === 'buscador-campo'));
  await pagina.keyboard.type('perlas');
  comprobar('busca mientras se escribe', (await pagina.locator('#buscador-resultados [role="option"]').count()) === 7 && (await pagina.locator('[data-buscador-estado]').textContent()) === '6 resultados');
  await pagina.keyboard.press('ArrowDown');
  await pagina.keyboard.press('ArrowDown');
  const activo = await pagina.evaluate(() => { const c = document.querySelector('#buscador-campo'); const o = document.getElementById(c.getAttribute('aria-activedescendant')); return { ok: o?.getAttribute('aria-selected') === 'true', expandido: c.getAttribute('aria-expanded') }; });
  comprobar('lista navegable con flechas (aria-activedescendant)', activo.ok && activo.expandido === 'true');
  await pagina.keyboard.press('Enter');
  await pagina.waitForSelector('#detalle.show');
  comprobar('Enter abre la pieza elegida', (await pagina.locator('#detalle-titulo').textContent()).length > 0);
  await pagina.keyboard.press('Escape');
  await pagina.waitForSelector('#detalle', { state: 'hidden' });
  await pagina.locator('[data-buscador-abrir]').click();
  await pagina.locator('#buscador-campo').fill('unicornio');
  comprobar('sin resultados: mensaje amable', (await pagina.locator('[data-buscador-estado]').textContent()).startsWith('No encontramos nada con «unicornio»'));
  await pagina.keyboard.press('Escape');
  comprobar('Escape cierra el buscador y devuelve el foco a la lupa', await pagina.locator('#buscador').isHidden() && await pagina.evaluate(() => document.activeElement?.hasAttribute('data-buscador-abrir')));
  await contexto.close();
}
{
  const { pagina, contexto } = await abrir({ ancho: 390, alto: 800, tactil: true });
  await pagina.locator('[data-buscador-abrir]').tap();
  const caja = await pagina.locator('.buscador__campo').boundingBox();
  comprobar('teléfono: el buscador ocupa el ancho disponible', caja.width > 390 * 0.85, `${caja.width}px`);
  await pagina.locator('[data-buscador-cerrar]').tap();
  await pagina.locator('.encabezado__menu').tap();
  await pagina.waitForSelector('#menu-movil.show');
  comprobar('teléfono: menú desplegable con aria-expanded', (await pagina.locator('.encabezado__menu').getAttribute('aria-expanded')) === 'true' && (await pagina.locator('.menu-movil__enlace').count()) === 5);
  await pagina.screenshot({ path: path.join(CAPTURAS, 'menu-390.png') });
  await pagina.locator('.menu-movil__enlace', { hasText: 'Cómo pedir' }).tap();
  await pagina.waitForSelector('#menu-movil', { state: 'hidden' });
  comprobar('teléfono: elegir una sección cierra el menú y navega', pagina.url().endsWith('#como-pedir'));
  // Tamaño de los elementos táctiles
  const chicos = await pagina.evaluate(() => [...document.querySelectorAll('a, button, input, select, textarea, label.casilla, .segmento label')].filter((e) => {
    // .pieza__abrir se excluye: su zona real de toque es toda la tarjeta (se estira con ::after).
    if (e.closest('.trampa, .offcanvas, .modal, template, [hidden], .visually-hidden, .saltar, .pieza__abrir') || e.type === 'hidden') return false;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (e.matches('input[type="checkbox"], input[type="radio"]')) { const c = (e.closest('.form-check, .casilla, .segmento') ?? e).getBoundingClientRect(); return c.height < 44; }
    if (getComputedStyle(e).display === 'inline') return false; // enlaces dentro de un párrafo
    return r.width < 44 || r.height < 43.5;
  }).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`).slice(0, 8));
  comprobar('teléfono: elementos táctiles de al menos 44 x 44 px', chicos.length === 0, chicos.join(', '));
  await contexto.close();
}

/* ================= 7. Formulario ================= */
console.log('\n[7] Formulario');
{
  const { pagina, contexto, registro } = await abrir();
  const errores = () => pagina.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-error]:not([hidden])')].map((e) => [e.dataset.error, e.textContent])));
  await pagina.locator('[data-form-enviar]').click();
  let e = await errores();
  comprobar('campos vacíos: un error en texto por cada dato obligatorio', Object.keys(e).sort().join() === 'consentimiento,correo,medio,nombre,telefono', JSON.stringify(e));
  comprobar('el resumen de errores recibe el foco y se anuncia (role="alert")', await pagina.evaluate(() => document.activeElement?.matches('[data-form-resumen][role="alert"]')));
  comprobar('los campos con error llevan aria-invalid', (await pagina.locator('#campo-nombre').getAttribute('aria-invalid')) === 'true');
  await pagina.locator('#campo-nombre').fill('<script>alert(1)</script>');
  await pagina.locator('#campo-correo').fill('correo raro@@ejemplo');
  await pagina.locator('#campo-telefono').fill('abc');
  await pagina.locator('#campo-mensaje').fill('x'.repeat(5000));
  await pagina.locator('[data-form-enviar]').click();
  e = await errores();
  comprobar('nombre, correo y teléfono raros se rechazan con mensajes claros', e.nombre?.includes('solo con letras') && e.correo?.includes('correo válido') && e.telefono?.includes('10 dígitos'), JSON.stringify(e));
  comprobar('el mensaje no puede pasar de 1000 caracteres', (await pagina.locator('#campo-mensaje').inputValue()).length === 1000);
  await pagina.locator('#campo-nombre').fill('María Guadalupe de los Ángeles Fernández-Villaseñor y Montes de Oca');
  await pagina.locator('#campo-correo').fill('maria.fernandez+pedidos@correo.com.mx');
  await pagina.locator('#campo-telefono').fill('(33) 1234-5678');
  await pagina.locator('label[for="medio-whatsapp"]').click();
  await pagina.locator('#campo-producto').selectOption('aretes-lavanda');
  await pagina.locator('label[for="campo-consentimiento"]').click();
  let peticiones = 0;
  pagina.on('request', (r) => { if (r.method() === 'POST') peticiones += 1; });
  await pagina.locator('[data-form-enviar]').click();
  await pagina.waitForSelector('[data-form-exito]:not([hidden])');
  const exito = await pagina.evaluate(() => ({ titulo: document.querySelector('[data-form-exito-titulo]').textContent, nota: document.querySelector('[data-form-exito-nota]').textContent, etiqueta: !document.querySelector('[data-form-simulacion]').hidden, foco: document.activeElement?.hasAttribute('data-form-exito'), html: document.querySelector('[data-form-exito]').innerHTML.includes('<script') }));
  comprobar('datos válidos (nombre largo incluido): confirmación cálida', exito.titulo === '¡Gracias, María!' && exito.foco, JSON.stringify(exito));
  comprobar('la confirmación dice con claridad que es una simulación', exito.etiqueta && exito.nota.includes('no se envió'));
  comprobar('el envío simulado no manda ningún dato a ningún servidor', peticiones === 0 && registro.externos.length === 0);
  await pagina.screenshot({ path: path.join(CAPTURAS, 'formulario-exito.png') });
  await pagina.locator('[data-form-otro]').click();
  comprobar('"Escribir otro mensaje" devuelve un formulario limpio', (await pagina.locator('#campo-nombre').inputValue()) === '' && await pagina.locator('[data-formulario]').isVisible());
  // Aviso de privacidad desde el formulario y desde el pie
  await pagina.locator('.campo--consentimiento .enlace').click();
  await pagina.waitForSelector('#aviso-privacidad.show');
  comprobar('el aviso de privacidad se abre desde el formulario', (await pagina.locator('.privacidad__borrador').textContent()).includes('Borrador provisional'));
  await pagina.keyboard.press('Escape');
  await pagina.waitForSelector('#aviso-privacidad', { state: 'hidden' });
  comprobar('al cerrar, el foco vuelve al enlace que lo abrió', await pagina.evaluate(() => document.activeElement?.classList.contains('enlace')));
  await pagina.locator('.pie__legal .pie__enlace').click();
  await pagina.waitForSelector('#aviso-privacidad.show');
  comprobar('el aviso de privacidad se abre desde el pie', true);
  await contexto.close();
}

/* ================= 8. Otros: teclado, sin JavaScript, 404, tema oscuro ================= */
console.log('\n[8] Teclado, sin JavaScript, 404 y tema oscuro');
{
  const { pagina, contexto } = await abrir();
  await pagina.keyboard.press('Tab');
  const primero = await pagina.evaluate(() => ({ clase: document.activeElement?.className, visible: document.activeElement?.getBoundingClientRect().top >= 0 }));
  comprobar('el primer Tab llega a "Saltar al contenido", visible', primero.clase === 'saltar' && primero.visible);
  const estructura = await pagina.evaluate(() => ({ h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, hitos: ['header', 'nav', 'main', 'footer'].every((t) => document.querySelector(t)), sinAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length, anio: document.querySelector('[data-anio]').textContent }));
  comprobar('un solo h1, idioma español, hitos y alt en todas las imágenes', estructura.h1 === 1 && estructura.lang.startsWith('es') && estructura.hitos && estructura.sinAlt === 0, JSON.stringify(estructura));
  comprobar('el año del pie es el actual', estructura.anio === String(new Date().getFullYear()));
  await pagina.evaluate(() => window.scrollTo(0, 3000));
  await pagina.waitForSelector('[data-arriba]:not([hidden])');
  const cajas = await pagina.evaluate(() => { const a = document.querySelector('[data-arriba]').getBoundingClientRect(); const w = document.querySelector('.flotante--whatsapp').getBoundingClientRect(); return a.bottom <= w.top; });
  comprobar('"Volver arriba" aparece al desplazarse y no tapa el botón de WhatsApp', cajas);
  await contexto.close();
}
{
  const { pagina, contexto, registro } = await abrir({ js: false });
  const sin = await pagina.evaluate(() => ({
    aviso: document.querySelector('#coleccion noscript') !== null && document.body.textContent.includes('necesitas activar JavaScript'),
    wa: [...document.querySelectorAll('a[href^="https://wa.me/"]')].filter((a) => a.getBoundingClientRect().width > 0).length,
    textos: ['Sobre nosotros', 'Cómo pedir', 'Preguntas frecuentes', 'Contacto', 'Aviso de privacidad'].every((x) => document.body.textContent.includes(x)),
    respuestas: document.querySelector('#pregunta-1').getBoundingClientRect().height > 0,
    ocultos: [...document.querySelectorAll('.solo-js')].every((e) => e.getBoundingClientRect().width === 0),
  }));
  comprobar('sin JavaScript: aviso en el catálogo, enlace directo a WhatsApp y contenido visible', sin.aviso && sin.wa >= 3 && sin.textos && sin.respuestas && sin.ocultos, JSON.stringify(sin));
  await pagina.screenshot({ path: path.join(CAPTURAS, 'sin-js-1280.png'), fullPage: true });
  comprobar('sin JavaScript: sin recursos externos', registro.externos.length === 0);
  await contexto.close();
}
{
  const { pagina, contexto, registro } = await abrir();
  const r = await pagina.goto(new URL('pagina/que/no/existe', URL_BASE).href);
  await pagina.waitForLoadState('load');
  const estilo = await pagina.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  comprobar('página 404 con el estilo del sitio y botón de regreso', r.status() === 404 && estilo.includes('Fraunces') && (await pagina.locator('.error-404 .btn').getAttribute('href')) === new URL(URL_BASE).pathname && registro.externos.length === 0, `${r.status()} ${estilo}`);
  await pagina.screenshot({ path: path.join(CAPTURAS, '404-1280.png') });
  await contexto.close();
}
for (const esquema of ['light', 'dark']) {
  for (const ancho of [390, 1280]) {
    const { pagina, contexto } = await abrir({ ancho, alto: 850, esquema, sinCsp: true, tactil: ancho < 500 });
    await recorrer(pagina);
    await axe(pagina, `página, ${esquema === 'dark' ? 'oscuro' : 'claro'}, ${ancho}px`);
    if (esquema === 'dark') await pagina.screenshot({ path: path.join(CAPTURAS, `oscuro-${ancho}.png`), fullPage: true });
    await pagina.locator('.rejilla .pieza__abrir').first().click();
    await pagina.waitForSelector('#detalle.show');
    await pagina.waitForTimeout(400);
    await axe(pagina, `ventana de detalle, ${esquema === 'dark' ? 'oscuro' : 'claro'}, ${ancho}px`);
    await pagina.locator('[data-detalle-anadir]').click();
    await pagina.keyboard.press('Escape');
    await pagina.waitForSelector('#detalle', { state: 'hidden' });
    await pagina.locator('[data-bolsa-boton]').click();
    await pagina.waitForSelector('#bolsa.show');
    await pagina.waitForTimeout(450);
    await axe(pagina, `bolsa, ${esquema === 'dark' ? 'oscuro' : 'claro'}, ${ancho}px`);
    if (ancho === 390 && esquema === 'light') await pagina.screenshot({ path: path.join(CAPTURAS, 'bolsa-390.png') });
    await pagina.keyboard.press('Escape');
    await pagina.waitForSelector('#bolsa', { state: 'hidden' });
    await pagina.locator('[data-form-enviar]').click();
    await axe(pagina, `formulario con errores, ${esquema === 'dark' ? 'oscuro' : 'claro'}, ${ancho}px`);
    await contexto.close();
  }
}

await navegador.close();
const fallas = resultados.filter((r) => !r.ok).length;
console.log(`\nResultado: ${resultados.length - fallas} de ${resultados.length} comprobaciones correctas. Capturas en pruebas/capturas/`);
if (fallas) {
  console.log('Fallas:\n - ' + problemas.join('\n - '));
  process.exitCode = 1;
}
