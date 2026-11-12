/**
 * Validación del formulario de contacto. La usan por igual el navegador y la
 * función del servidor (functions/api/contacto.js): el servidor NUNCA debe
 * confiar en que el navegador ya validó.
 *
 * Devuelve { valido, errores, datos }:
 *   errores  { campo: código }  El código es una clave de textos.formulario.errores.
 *   datos    Los valores ya limpios, listos para usarse.
 */
import { PATRON_ID } from './catalogo.js';
import { limpiar, limpiarMultilinea } from './texto.js';

export const LIMITES = Object.freeze({ nombre: 80, correo: 254, telefono: 15, mensaje: 1000 });
export const MEDIOS = Object.freeze(['correo', 'telefono', 'whatsapp']);
/** Campo trampa: las personas no lo ven; si llega relleno, lo llenó un bot. */
export const CAMPO_TRAMPA = 'sitio_web';

const NOMBRE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const CORREO = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function validarContacto(crudo = {}, { idsProducto = null } = {}) {
  const errores = {};

  const nombre = limpiar(crudo.nombre, 200);
  const letras = (nombre.match(/\p{L}/gu) ?? []).length;
  if (!nombre) errores.nombre = 'nombreVacio';
  else if (nombre.length > LIMITES.nombre || letras < 2 || !NOMBRE.test(nombre)) errores.nombre = 'nombreInvalido';

  // Solo se recortan los extremos: un espacio en medio es un error que la persona debe ver.
  const correo = limpiar(crudo.correo, 400);
  const [local = '', dominio = ''] = correo.split('@');
  if (!correo) errores.correo = 'correoVacio';
  else if (correo.length > LIMITES.correo || local.length > 64 || correo.includes('..') || !CORREO.test(correo) || !/\.[A-Za-z]{2,}$/.test(dominio)) {
    errores.correo = 'correoInvalido';
  }

  const telefonoEscrito = limpiar(crudo.telefono, 60);
  const telefono = telefonoEscrito.replace(/[\s().+-]/g, '');
  if (!telefonoEscrito) errores.telefono = 'telefonoVacio';
  else if (!/^\d{10,15}$/.test(telefono)) errores.telefono = 'telefonoInvalido';

  const medio = String(crudo.medio ?? '');
  if (!MEDIOS.includes(medio)) errores.medio = 'medioVacio';

  const producto = String(crudo.producto ?? '');
  const productoValido = producto === '' || (PATRON_ID.test(producto) && producto.length <= 60 && (!idsProducto || idsProducto.has(producto)));
  if (!productoValido) errores.producto = 'productoInvalido';

  const mensajeCompleto = limpiarMultilinea(crudo.mensaje, LIMITES.mensaje + 1);
  if (mensajeCompleto.length > LIMITES.mensaje) errores.mensaje = 'mensajeLargo';

  if (crudo.consentimiento !== true && crudo.consentimiento !== 'on' && crudo.consentimiento !== 'true') {
    errores.consentimiento = 'consentimientoVacio';
  }

  return {
    valido: Object.keys(errores).length === 0,
    esBot: limpiar(crudo[CAMPO_TRAMPA], 10) !== '',
    errores,
    datos: {
      nombre: nombre.slice(0, LIMITES.nombre),
      correo: correo.slice(0, LIMITES.correo),
      telefono: telefono.slice(0, LIMITES.telefono),
      medio: MEDIOS.includes(medio) ? medio : '',
      producto: productoValido ? producto : '',
      mensaje: mensajeCompleto.slice(0, LIMITES.mensaje),
    },
  };
}
