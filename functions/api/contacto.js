/**
 * PREPARADO PARA LA VERSIÓN FINAL (Cloudflare Pages Functions). El prototipo
 * en GitHub Pages NO ejecuta este archivo: ahí el formulario es simulado.
 *
 * Recibe el formulario de contacto en POST /api/contacto y aplica, en orden:
 *   1. Solo POST, solo JSON, solo desde el propio sitio y con tamaño acotado.
 *   2. Límite de solicitudes por IP (necesita el almacén KV "LIMITE").
 *   3. Verificación anti-bots con Cloudflare Turnstile.
 *   4. La MISMA validación que usa el navegador (nucleo/validacion.js).
 *   5. Envío del correo al destino guardado en el servidor.
 *
 * Qué hay que configurar en Cloudflare (ver README):
 *   CORREO_DESTINO      Correo que recibe los pedidos. Nunca va en el código del sitio.
 *   TURNSTILE_SECRETO   Clave secreta de Turnstile.
 *   LIMITE              Almacén KV para contar solicitudes por IP.
 *   (pendiente)         Las credenciales del servicio de correo que se elija.
 */
import { validarContacto } from '../../sitio/assets/js/nucleo/validacion.js';

const MAX_BYTES = 8 * 1024;
const MAX_POR_VENTANA = 5; // solicitudes permitidas...
const VENTANA_SEGUNDOS = 600; // ...cada 10 minutos, por IP

const responder = (estado, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

/** Cuenta solicitudes por IP en ventanas fijas. Devuelve true si se pasó del límite. */
export async function limiteSuperado(env, ip, ahora = Date.now()) {
  const ventana = Math.floor(ahora / 1000 / VENTANA_SEGUNDOS);
  const clave = `contacto:${ip}:${ventana}`;
  const usados = Number((await env.LIMITE.get(clave)) ?? 0);
  if (usados >= MAX_POR_VENTANA) return true;
  await env.LIMITE.put(clave, String(usados + 1), { expirationTtl: VENTANA_SEGUNDOS * 2 });
  return false;
}

async function turnstileValido(env, token, ip) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  const cuerpo = new URLSearchParams({ secret: env.TURNSTILE_SECRETO, response: token, remoteip: ip });
  const respuesta = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: cuerpo });
  return respuesta.ok && (await respuesta.json()).success === true;
}

/**
 * PENDIENTE: elegir el servicio de correo (decisión del negocio) y completar
 * esta función. Debe enviar `datos` a env.CORREO_DESTINO como TEXTO PLANO
 * (nunca como HTML) y lanzar un error si el envío falla.
 */
async function enviarCorreo(env, datos) {
  if (!env.CORREO_DESTINO || !datos) throw new Error('Falta CORREO_DESTINO');
  throw new Error('El envío de correo todavía no está configurado');
}

export async function onRequestPost({ request, env }) {
  // Sin configuración completa, el servicio se declara no disponible en vez de aceptar datos a ciegas.
  if (!env.LIMITE || !env.TURNSTILE_SECRETO || !env.CORREO_DESTINO) return responder(503, { error: 'servidor' });

  const origen = request.headers.get('Origin');
  if (!origen || origen !== new URL(request.url).origin) return responder(403, { error: 'origen' });
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) return responder(415, { error: 'formato' });

  const texto = await request.text();
  if (texto.length > MAX_BYTES) return responder(413, { error: 'tamano' });
  let crudo;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return responder(400, { error: 'formato' });
  }
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return responder(400, { error: 'formato' });

  const ip = request.headers.get('CF-Connecting-IP') ?? 'desconocida';
  if (await limiteSuperado(env, ip)) return responder(429, { error: 'demasiados' });
  if (!(await turnstileValido(env, crudo.turnstile, ip))) return responder(403, { error: 'verificacion' });

  const { valido, esBot, errores, datos } = validarContacto(crudo);
  if (esBot) return responder(200, { ok: true }); // al bot se le responde "bien" y no se envía nada
  if (!valido) return responder(422, { error: 'validacion', campos: errores });

  try {
    await enviarCorreo(env, datos);
  } catch {
    return responder(502, { error: 'servidor' }); // sin detalles internos hacia afuera
  }
  return responder(200, { ok: true });
}

/** Cualquier otro método (GET, PUT...) se rechaza. */
export const onRequest = () => responder(405, { error: 'metodo' });
