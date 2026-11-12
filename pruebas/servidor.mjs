/**
 * Pruebas de la función del servidor (functions/api/contacto.js) sin Cloudflare:
 * se le pasan solicitudes y un entorno simulados.
 *
 *   node --test pruebas/servidor.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequest, limiteSuperado } from '../functions/api/contacto.js';

const kv = () => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
};
const entorno = () => ({ LIMITE: kv(), TURNSTILE_SECRETO: 'secreto-de-prueba', CORREO_DESTINO: 'pedidos@ejemplo.com' });
const valido = { nombre: 'Ana López', correo: 'ana@correo.com', telefono: '3312345678', medio: 'correo', consentimiento: true, turnstile: 'token' };
const solicitud = (cuerpo, cabeceras = {}) => new Request('https://sitio.test/api/contacto', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://sitio.test', 'CF-Connecting-IP': '203.0.113.7', ...cabeceras },
  body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
});
const conTurnstile = async (exito, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: exito }), { status: 200 });
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
};

test('rechaza lo que no cumple antes de leer los datos', async () => {
  assert.equal((await onRequest()).status, 405);
  assert.equal((await onRequestPost({ request: solicitud(valido), env: {} })).status, 503);
  assert.equal((await onRequestPost({ request: solicitud(valido, { Origin: 'https://otro-sitio.test' }), env: entorno() })).status, 403);
  assert.equal((await onRequestPost({ request: solicitud(valido, { 'Content-Type': 'text/plain' }), env: entorno() })).status, 415);
  assert.equal((await onRequestPost({ request: solicitud('{mal json'), env: entorno() })).status, 400);
  assert.equal((await onRequestPost({ request: solicitud({ ...valido, mensaje: 'x'.repeat(9000) }), env: entorno() })).status, 413);
});

test('Turnstile y validación del servidor', async () => {
  assert.equal(await conTurnstile(false, async () => (await onRequestPost({ request: solicitud(valido), env: entorno() })).status), 403);
  const mala = await conTurnstile(true, () => onRequestPost({ request: solicitud({ ...valido, correo: 'no-es-correo', nombre: '<script>' }), env: entorno() }));
  assert.equal(mala.status, 422);
  assert.deepEqual((await mala.json()).campos, { nombre: 'nombreInvalido', correo: 'correoInvalido' });
  const bot = await conTurnstile(true, () => onRequestPost({ request: solicitud({ ...valido, sitio_web: 'spam' }), env: entorno() }));
  assert.equal(bot.status, 200);
  // El envío de correo aún no está configurado: debe fallar de forma controlada, sin detalles internos.
  const envio = await conTurnstile(true, () => onRequestPost({ request: solicitud(valido), env: entorno() }));
  assert.equal(envio.status, 502);
  assert.deepEqual(await envio.json(), { error: 'servidor' });
});

test('límite de solicitudes por IP', async () => {
  const env = entorno();
  const ahora = 1_800_000_000_000;
  for (let i = 0; i < 5; i++) assert.equal(await limiteSuperado(env, '203.0.113.9', ahora), false);
  assert.equal(await limiteSuperado(env, '203.0.113.9', ahora), true);
  assert.equal(await limiteSuperado(env, '203.0.113.10', ahora), false, 'otra IP no se ve afectada');
  assert.equal(await limiteSuperado(env, '203.0.113.9', ahora + 601_000), false, 'en la siguiente ventana vuelve a pasar');
  const sexto = await conTurnstile(true, async () => {
    const e = entorno();
    let ultimo;
    for (let i = 0; i < 6; i++) ultimo = await onRequestPost({ request: solicitud(valido), env: e });
    return ultimo.status;
  });
  assert.equal(sexto, 429);
});
