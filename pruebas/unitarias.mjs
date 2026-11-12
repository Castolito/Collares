/**
 * Pruebas de la lógica central (WhatsApp, bolsa, filtros, catálogo y
 * formulario). No necesitan navegador ni instalar nada:
 *
 *   node --test pruebas/unitarias.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizar, limpiar, limpiarMultilinea, rellenar, aSlug } from '../sitio/assets/js/nucleo/texto.js';
import { numeroWhatsApp, enlaceWhatsApp, mensajeProducto, mensajeBolsa, enlaceTelefono, enlaceCorreo } from '../sitio/assets/js/nucleo/whatsapp.js';
import { normalizarCatalogo, formatearPrecio } from '../sitio/assets/js/nucleo/catalogo.js';
import { filtrar, buscar, materialesDe, rangoPrecios, criterioVacio, contarActivos } from '../sitio/assets/js/nucleo/filtros.js';
import { sanear, leer, serializar, agregar, fijarCantidad, quitar, totalPiezas } from '../sitio/assets/js/nucleo/bolsa.js';
import { validarContacto, LIMITES } from '../sitio/assets/js/nucleo/validacion.js';

const leerJson = (ruta) => JSON.parse(fs.readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const config = leerJson('../sitio/datos/config.json');
const crudo = leerJson('../sitio/datos/productos.json');
const catalogo = normalizarCatalogo(crudo);
const porId = (id) => catalogo.productos.find((p) => p.id === id);
const limites = { idsValidos: new Set(catalogo.productos.map((p) => p.id)), maxPorPieza: 10, maxDistintas: 30 };

test('texto: normaliza, limpia y rellena', () => {
  assert.equal(normalizar('  ÁGATA  Lapislázuli '), 'agata lapislazuli');
  assert.equal(limpiar(`  hola${String.fromCodePoint(0)}   mundo${String.fromCodePoint(0x200b)}  `, 50), 'hola mundo');
  assert.equal(limpiar('a'.repeat(300), 10).length, 10);
  assert.equal(limpiarMultilinea('uno\r\n\r\n\r\n\r\ndos  tres'), 'uno\n\ndos tres');
  assert.equal(rellenar('Hola {nombre}, {otra}', { nombre: 'Ana' }), 'Hola Ana, {otra}');
  assert.equal(aSlug('Cuarzo rosa'), 'cuarzo-rosa');
});

test('catálogo de ejemplo: 20 piezas, 10 collares y 10 aretes, 4 más vendidas, sin precios', () => {
  assert.deepEqual(catalogo.avisos, []);
  assert.equal(catalogo.productos.length, 20);
  assert.deepEqual(catalogo.categorias.map((c) => [c.nombre, c.total]), [['Collares', 10], ['Aretes', 10]]);
  const vendidos = catalogo.productos.filter((p) => p.masVendido);
  assert.equal(vendidos.length, 4);
  assert.deepEqual([...new Set(vendidos.map((p) => p.categoria.nombre))].sort(), ['Aretes', 'Collares']);
  assert.ok(catalogo.productos.every((p) => p.precio === null));
  assert.ok(catalogo.productos.every((p) => p.fotos.length >= 1 && p.fotos.every((f) => f.alt.length > 20)));
  assert.ok(catalogo.productos.every((p) => p.caracteristicas.length >= 5 && p.descripcion.length > 30));
  for (const m of ['Perlas', 'Amatista', 'Turquesa', 'Cuarzo rosa', 'Ojo de tigre', 'Lapislázuli', 'Ágata']) {
    assert.ok(materialesDe(catalogo.productos).some((x) => x.nombre === m), `falta el material ${m}`);
  }
});

test('catálogo: todas las fotos referidas existen en los tres tamaños', () => {
  const bases = new Set(catalogo.productos.flatMap((p) => p.fotos.map((f) => f.base)));
  for (const c of catalogo.categorias) bases.add(c.foto.base);
  for (const base of bases) {
    for (const ancho of [480, 768, 1280]) {
      assert.ok(fs.existsSync(new URL(`../sitio/assets/fotos/${base}-${ancho}.webp`, import.meta.url)), `${base}-${ancho}.webp`);
    }
  }
});

test('catálogo: descarta datos mal formados sin romperse', () => {
  const sucio = normalizarCatalogo({
    productos: [
      { id: '../../etc', nombre: 'Malo', categoria: 'Collares' },
      { id: 'sin-nombre', categoria: 'Collares' },
      { id: 'bueno', nombre: '<script>alert(1)</script>', categoria: 'Pulseras', material: ['Jade', '', 7], precio: '1,250.50',
        fotos: [{ base: '../secreto', alt: 'x' }, { base: 'foto-buena', alt: 'ok' }], caracteristicas: [{ etiqueta: '', valor: 'x' }] },
      { id: 'bueno', nombre: 'Repetido', categoria: 'Pulseras' },
      null,
    ],
  });
  assert.equal(sucio.productos.length, 1);
  const p = sucio.productos[0];
  assert.equal(p.precio, 1250.5);
  assert.deepEqual(p.materiales, ['Jade', '7']);
  assert.deepEqual(p.fotos.map((f) => f.base), ['foto-buena']);
  assert.equal(p.categoria.nombre, 'Pulseras');
  assert.equal(p.categoria.pedir, 'Pedir esta pieza');
  assert.equal(p.nombre, '<script>alert(1)</script>'); // se conserva como texto; la página nunca lo inserta como HTML
  assert.equal(sucio.avisos.length, 4);
  assert.deepEqual(normalizarCatalogo(null).productos, []);
  assert.match(formatearPrecio(1250.5), /1,250\.50/);
});

test('WhatsApp: número provisional, número real y codificación del mensaje', () => {
  assert.equal(numeroWhatsApp('+52 312 XXX XXXX'), '');
  assert.equal(numeroWhatsApp('+52 33 1234 5678'), '523312345678');
  assert.equal(numeroWhatsApp('33 1234 5678'), '523312345678');
  assert.equal(numeroWhatsApp('123'), '');
  assert.equal(enlaceWhatsApp(config.contacto.whatsapp, 'Hola'), 'https://wa.me/?text=Hola');
  const enlace = enlaceWhatsApp('+52 33 1234 5678', 'Hola, me interesa el collar Rocío. ¿Me das más información? & 100% #1');
  const url = new URL(enlace);
  assert.equal(url.origin + url.pathname, 'https://wa.me/523312345678');
  assert.equal(url.searchParams.get('text'), 'Hola, me interesa el collar Rocío. ¿Me das más información? & 100% #1');
  assert.ok(!/[ ¿ó&#]/.test(enlace.split('?text=')[1]), 'el mensaje debe ir codificado');
});

test('WhatsApp: mensaje por pieza según su categoría', () => {
  assert.equal(mensajeProducto(porId('collar-luna-de-agua'), config), 'Hola, me interesa el collar Luna de Agua. ¿Me das más información?');
  assert.equal(mensajeProducto(porId('aretes-lavanda'), config), 'Hola, me interesan los aretes Lavanda. ¿Me das más información?');
  const nueva = normalizarCatalogo({ productos: [{ id: 'pulsera-sol', nombre: 'Sol', categoria: 'Pulseras' }] }).productos[0];
  assert.equal(mensajeProducto(nueva, config), 'Hola, me interesa la pieza Sol (Pulseras). ¿Me das más información?');
});

test('WhatsApp: mensaje de la bolsa, con y sin recorte por largo', () => {
  const corto = mensajeBolsa([{ id: 'a', cantidad: 1, nombre: 'Collar Luna' }, { id: 'b', cantidad: 2, nombre: 'Collar Aurora' }], config);
  assert.equal(corto.mensaje, 'Hola, quiero hacer este pedido: 1 x Collar Luna, 2 x Collar Aurora');
  assert.equal(corto.omitidas, 0);

  const muchas = Array.from({ length: 30 }, (_, i) => ({ id: `p-${i}`, cantidad: 10, nombre: `Collar de nombre bastante largo número ${i}` }));
  const largo = mensajeBolsa(muchas, { whatsapp: { ...config.whatsapp, maxCaracteres: 400 } });
  assert.ok(largo.mensaje.length <= 400);
  assert.ok(largo.omitidas > 0 && largo.incluidas + largo.omitidas === 30);
  assert.match(largo.mensaje, new RegExp(`y ${largo.omitidas} más`));

  const conId = mensajeBolsa([{ id: 'collar-luna', cantidad: 1, nombre: 'Collar Luna' }], { whatsapp: { ...config.whatsapp, incluirIdEnBolsa: true } });
  assert.equal(conId.mensaje, 'Hola, quiero hacer este pedido: 1 x Collar Luna [collar-luna]');
});

test('contacto: los marcadores provisionales no se convierten en enlaces', () => {
  assert.equal(enlaceTelefono(config.contacto.telefono), '');
  assert.equal(enlaceCorreo(config.contacto.correo), '');
  assert.equal(enlaceTelefono('33 1234 5678'), 'tel:+523312345678');
  assert.equal(enlaceCorreo('hola@mimarca.mx'), 'mailto:hola@mimarca.mx');
  assert.equal(enlaceCorreo('javascript:alert(1)'), '');
});

test('filtros: categoría, materiales (cualquiera de los marcados), texto y precio', () => {
  const todos = catalogo.productos;
  assert.equal(filtrar(todos, criterioVacio()).length, 20);
  assert.equal(filtrar(todos, { ...criterioVacio(), categoria: 'aretes' }).length, 10);
  const perlasOTurquesa = filtrar(todos, { ...criterioVacio(), materiales: ['Perlas', 'Turquesa'] });
  assert.ok(perlasOTurquesa.length > 0 && perlasOTurquesa.every((p) => p.materiales.some((m) => ['Perlas', 'Turquesa'].includes(m))));
  assert.equal(filtrar(todos, { ...criterioVacio(), categoria: 'collares', materiales: ['Perlas'] }).length, 3);
  assert.deepEqual(filtrar(todos, { ...criterioVacio(), texto: 'lapislazuli arete' }).map((p) => p.id), ['aretes-medianoche']);
  assert.equal(filtrar(todos, { ...criterioVacio(), texto: 'zzz' }).length, 0);
  assert.equal(rangoPrecios(todos), null);
  assert.equal(filtrar(todos, { ...criterioVacio(), precioMin: 100 }).length, 0, 'sin precios, el filtro de precio no deja pasar nada');

  const conPrecio = todos.map((p, i) => ({ ...p, precio: (i + 1) * 100 }));
  assert.deepEqual(rangoPrecios(conPrecio), { min: 100, max: 2000 });
  assert.equal(filtrar(conPrecio, { ...criterioVacio(), precioMin: 500, precioMax: 900 }).length, 5);
  assert.equal(contarActivos({ ...criterioVacio(), materiales: ['Perlas', 'Ágata'], precioMax: 5 }), 3);
});

test('filtros: los materiales disponibles dependen de la categoría', () => {
  const collares = materialesDe(catalogo.productos, 'collares');
  assert.equal(collares.find((m) => m.nombre === 'Perlas').total, 3);
  assert.deepEqual(collares.map((m) => m.nombre), [...collares.map((m) => m.nombre)].sort((a, b) => a.localeCompare(b, 'es')));
  assert.equal(materialesDe(catalogo.productos, 'no-existe').length, 0);
});

test('buscador: por nombre, material y categoría, sin importar acentos', () => {
  assert.equal(buscar(catalogo.productos, 'luna').resultados[0].id, 'collar-luna-de-agua');
  assert.equal(buscar(catalogo.productos, 'AGATA').total, 2);
  assert.equal(buscar(catalogo.productos, 'aretes').total, 10);
  assert.equal(buscar(catalogo.productos, 'aretes', 6).resultados.length, 6);
  assert.equal(buscar(catalogo.productos, '   ').total, 0);
  assert.equal(buscar(catalogo.productos, 'unicornio').total, 0);
});

test('bolsa: suma, resta, topes y casos límite', () => {
  let items = [];
  let r = agregar(items, 'collar-rocio', limites);
  assert.equal(r.resultado, 'nueva');
  r = agregar(r.items, 'collar-rocio', limites);
  assert.equal(r.resultado, 'sumada');
  assert.deepEqual(r.items, [{ id: 'collar-rocio', cantidad: 2 }]);
  assert.equal(agregar(r.items, 'no-existe', limites).resultado, 'desconocida');

  items = fijarCantidad(r.items, 'collar-rocio', 10, limites).items;
  assert.equal(agregar(items, 'collar-rocio', limites).resultado, 'maximo');
  assert.equal(fijarCantidad(items, 'collar-rocio', 99, limites).items[0].cantidad, 10);
  assert.equal(fijarCantidad(items, 'collar-rocio', 2.5, limites).resultado, 'sin-cambio');
  assert.deepEqual(fijarCantidad(items, 'collar-rocio', 0, limites).items, []);
  assert.deepEqual(quitar(items, 'collar-rocio'), []);

  const pocas = { ...limites, maxDistintas: 2 };
  let llena = agregar(agregar([], 'collar-rocio', pocas).items, 'collar-alba', pocas).items;
  assert.equal(agregar(llena, 'collar-barranca', pocas).resultado, 'llena');
  assert.equal(totalPiezas([{ id: 'a', cantidad: 2 }, { id: 'b', cantidad: 3 }]), 5);
  assert.equal(totalPiezas([]), 0);
});

test('bolsa: lo leído de localStorage se valida antes de usarse', () => {
  const buena = [{ id: 'collar-rocio', cantidad: 2 }, { id: 'aretes-miel', cantidad: 1 }];
  assert.deepEqual(leer(serializar(buena), limites), buena);
  assert.deepEqual(leer('no es json', limites), []);
  assert.deepEqual(leer(null, limites), []);
  assert.deepEqual(leer('{"v":99,"items":[["collar-rocio",1]]}', limites), []);
  assert.deepEqual(leer('x'.repeat(30000), limites), []);
  const manipulada = JSON.stringify({ v: 1, items: [
    ['collar-rocio', 9999], ['collar-rocio', 5], ['ya-no-existe', 1], ['aretes-miel', -3], ['aretes-miel', '2'],
    ['<img src=x onerror=alert(1)>', 1], ['collar-alba', 1.5], 'basura', null, ['collar-barranca', 1, 'extra'], { id: 'collar-alba' },
  ], nombre: 'dato personal que no debería estar' });
  assert.deepEqual(leer(manipulada, limites), [{ id: 'collar-rocio', cantidad: 10 }]);
  assert.deepEqual(sanear({ v: 1, items: 'no-lista' }, limites), []);
  assert.ok(!serializar(buena).includes('nombre'), 'la bolsa solo guarda identificadores y cantidades');
});

test('formulario: datos válidos', () => {
  const r = validarContacto({ nombre: '  María José  Núñez-O’Brien ', correo: ' maria@correo.com.mx ', telefono: '(33) 1234-5678', medio: 'whatsapp', producto: 'collar-rocio', mensaje: 'Hola\r\n¿Tienen más colores?', consentimiento: true }, { idsProducto: limites.idsValidos });
  assert.equal(r.valido, true);
  assert.equal(r.esBot, false);
  assert.deepEqual(r.datos, { nombre: 'María José Núñez-O’Brien', correo: 'maria@correo.com.mx', telefono: '3312345678', medio: 'whatsapp', producto: 'collar-rocio', mensaje: 'Hola\n¿Tienen más colores?' });
  assert.equal(validarContacto({ nombre: 'Li', correo: 'a@b.mx', telefono: '+52 33 1234 5678', medio: 'correo', consentimiento: 'on' }).valido, true);
});

test('formulario: campos vacíos, nombres y correos raros, textos muy largos', () => {
  const vacio = validarContacto({});
  assert.deepEqual(vacio.errores, { nombre: 'nombreVacio', correo: 'correoVacio', telefono: 'telefonoVacio', medio: 'medioVacio', consentimiento: 'consentimientoVacio' });

  const base = { nombre: 'Ana', correo: 'ana@correo.com', telefono: '3312345678', medio: 'correo', consentimiento: true };
  const error = (cambios, campo) => validarContacto({ ...base, ...cambios }).errores[campo];
  assert.equal(error({ nombre: 'A' }, 'nombre'), 'nombreInvalido');
  assert.equal(error({ nombre: '12345' }, 'nombre'), 'nombreInvalido');
  assert.equal(error({ nombre: '<script>alert(1)</script>' }, 'nombre'), 'nombreInvalido');
  assert.equal(error({ nombre: 'a'.repeat(LIMITES.nombre + 1) }, 'nombre'), 'nombreInvalido');
  assert.equal(error({ nombre: 'Wolfeschlegelsteinhausenbergerdorff Hernández de la Santísima Trinidad' }, 'nombre'), undefined);
  assert.equal(error({ nombre: '     ' }, 'nombre'), 'nombreVacio');
  for (const correo of ['sin-arroba', 'a@b', 'a@@b.com', 'a b@c.com x', '@correo.com', 'a..b@correo.com', 'a@-correo.com', 'a@correo.c', `${'a'.repeat(65)}@correo.com`, 'a@correo.com<script>']) {
    assert.equal(error({ correo }, 'correo'), 'correoInvalido', correo);
  }
  assert.equal(error({ correo: 'nombre.apellido+etiqueta@sub.dominio.com.mx' }, 'correo'), undefined);
  for (const telefono of ['123', 'abcdefghij', '33 1234 567', '1'.repeat(16), '33-1234-5678 ext 2']) {
    assert.equal(error({ telefono }, 'telefono'), 'telefonoInvalido', telefono);
  }
  assert.equal(error({ medio: 'paloma mensajera' }, 'medio'), 'medioVacio');
  assert.equal(error({ producto: '../../etc/passwd' }, 'producto'), 'productoInvalido');
  assert.equal(validarContacto({ ...base, producto: 'no-existe' }, { idsProducto: limites.idsValidos }).errores.producto, 'productoInvalido');
  assert.equal(error({ mensaje: 'x'.repeat(LIMITES.mensaje + 1) }, 'mensaje'), 'mensajeLargo');
  assert.equal(error({ mensaje: 'x'.repeat(LIMITES.mensaje) }, 'mensaje'), undefined);
  assert.equal(error({ consentimiento: false }, 'consentimiento'), 'consentimientoVacio');
  assert.equal(validarContacto({ ...base, sitio_web: 'http://spam' }).esBot, true);
});
