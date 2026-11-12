/**
 * WhatsApp: el ÚNICO lugar donde se construyen los enlaces y los mensajes.
 *
 * Para conectar el chatbot más adelante solo hay que tocar este archivo y las
 * plantillas de mensaje de datos/config.json (ver README, "Conectar el bot").
 * Las plantillas aceptan {nombre}, {categoria} e {id}; {id} es el
 * identificador estable del producto, pensado para que el bot lo reconozca.
 */
import { limpiar, rellenar } from './texto.js';

const PREFIJO_MEXICO = '52';

/**
 * Convierte el valor de config.json en el número que espera wa.me (solo
 * dígitos, con código de país). Devuelve '' si el valor todavía es un
 * marcador como "+52 312 XXX XXXX" o no parece un teléfono.
 */
export function numeroWhatsApp(valor) {
  const texto = String(valor ?? '');
  if (/[a-z]/i.test(texto)) return '';
  const digitos = texto.replace(/\D/g, '');
  if (digitos.length === 10) return PREFIJO_MEXICO + digitos;
  return digitos.length >= 11 && digitos.length <= 15 ? digitos : '';
}

/**
 * Enlace que abre el chat con el mensaje ya escrito. Si todavía no hay un
 * número real, abre WhatsApp con el mensaje y deja elegir el contacto.
 */
export function enlaceWhatsApp(valorNumero, mensaje) {
  const numero = numeroWhatsApp(valorNumero);
  const texto = encodeURIComponent(limpiar(mensaje, 4000));
  return `https://wa.me/${numero}?text=${texto}`;
}

/** "Hola, me interesa el collar Luna de Agua. ¿Me das más información?" */
export function mensajeProducto(producto, config) {
  const plantilla = producto.categoria?.mensaje || config.whatsapp.mensajeProducto;
  return rellenar(plantilla, {
    nombre: producto.nombre,
    categoria: producto.categoria?.nombre ?? '',
    id: producto.id,
  });
}

/**
 * "Hola, quiero hacer este pedido: 1 x Collar Luna, 2 x Collar Aurora".
 * Si la lista no cabe en el límite, incluye las que quepan y avisa cuántas
 * faltan. Devuelve también cuántas entraron, para avisar a la persona.
 */
export function mensajeBolsa(lineas, config) {
  const { mensajeBolsa: plantilla, mensajeBolsaResto: resto, maxCaracteres, incluirIdEnBolsa } = config.whatsapp;
  // Con incluirIdEnBolsa cada línea lleva su identificador, p. ej. "1 x Collar Luna [collar-luna]".
  const partes = lineas.map((l) => `${l.cantidad} x ${l.nombre}${incluirIdEnBolsa === true ? ` [${l.id}]` : ''}`);
  const armar = (cuantas) => {
    const faltan = partes.length - cuantas;
    const lista = partes.slice(0, cuantas).join(', ') + (faltan > 0 ? rellenar(resto, { n: faltan }) : '');
    return rellenar(plantilla, { piezas: lista });
  };
  let incluidas = partes.length;
  while (incluidas > 1 && armar(incluidas).length > maxCaracteres) incluidas -= 1;
  return { mensaje: armar(incluidas), incluidas, omitidas: partes.length - incluidas };
}

/** Enlace tel: solo si el teléfono ya es real; '' mientras sea un marcador. */
export function enlaceTelefono(valor) {
  const numero = numeroWhatsApp(valor);
  return numero ? `tel:+${numero}` : '';
}

/** Enlace mailto: solo si el correo ya es real; '' mientras sea de ejemplo. */
export function enlaceCorreo(valor) {
  const correo = String(valor ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return '';
  if (/@(ejemplo|example)\.(com|org|net|mx)$/i.test(correo)) return '';
  return `mailto:${correo}`;
}
