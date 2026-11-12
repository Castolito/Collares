/**
 * Formulario de contacto (opción secundaria; el camino principal es WhatsApp).
 *
 * config.formulario.modo:
 *   "simulado"  Prototipo: valida y muestra la confirmación, pero NO envía ni guarda nada.
 *   "servidor"  Versión final: envía los datos a config.formulario.endpoint
 *               (functions/api/contacto.js en Cloudflare). El correo de destino
 *               vive en el servidor, nunca en este código.
 */
import { rellenar } from '../nucleo/texto.js';
import { validarContacto } from '../nucleo/validacion.js';
import { $, $$ } from './dom.js';

export function crearFormulario(app) {
  const t = app.textos.formulario;
  const ajustes = app.config.formulario;
  const formulario = $('[data-formulario]');
  if (!formulario) return;
  const resumen = $('[data-form-resumen]');
  const exito = $('[data-form-exito]');
  const enviar = $('[data-form-enviar]');
  const idsProducto = new Set(app.porId.keys());

  // "Pieza de interés": se llena con el catálogo.
  const selector = $('#campo-producto');
  for (const p of app.catalogo.productos) {
    const opcion = document.createElement('option');
    opcion.value = p.id;
    opcion.textContent = p.nombreCompleto;
    selector.append(opcion);
  }

  const controlesDe = (campo) => (campo === 'medio' ? $$('input[name="medio"]', formulario) : [formulario.elements[campo]].filter(Boolean));

  function mostrarErrores(errores) {
    const enlaces = [];
    for (const parrafo of $$('[data-error]', formulario)) {
      const campo = parrafo.dataset.error;
      const codigo = errores[campo];
      const texto = codigo ? rellenar(t.errores[codigo], { max: ajustes.maxMensaje }) : '';
      parrafo.textContent = texto;
      parrafo.hidden = !texto;
      for (const control of controlesDe(campo)) {
        if (texto) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      }
      if (texto) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${controlesDe(campo)[0].id}`;
        a.textContent = texto;
        a.addEventListener('click', (evento) => {
          evento.preventDefault();
          controlesDe(campo)[0].focus();
        });
        li.append(a);
        enlaces.push(li);
      }
    }
    $('ul', resumen).replaceChildren(...enlaces);
    resumen.hidden = enlaces.length === 0;
    if (enlaces.length) resumen.focus();
  }

  function mostrarExito(nombre) {
    const simulado = ajustes.modo !== 'servidor';
    $('[data-form-exito-titulo]').textContent = rellenar(t.exitoTitulo, { nombre });
    $('[data-form-exito-texto]').textContent = t.exitoTexto;
    $('[data-form-simulacion]').hidden = !simulado;
    $('[data-form-exito-nota]').hidden = !simulado;
    formulario.hidden = true;
    exito.hidden = false;
    exito.focus();
  }

  async function enviarAlServidor(datos) {
    const respuesta = await fetch(ajustes.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    if (respuesta.status === 429) throw new Error('demasiados');
    if (!respuesta.ok) throw new Error('servidor');
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviar.disabled) return;
    const crudo = Object.fromEntries(new FormData(formulario));
    crudo.consentimiento = formulario.elements.consentimiento.checked;
    const { valido, esBot, errores, datos } = validarContacto(crudo, { idsProducto });
    mostrarErrores(errores);
    if (!valido) return;

    enviar.disabled = true;
    enviar.textContent = t.enviando;
    try {
      if (esBot) {
        // Un bot llenó el campo trampa: se finge el éxito y no se envía nada.
      } else if (ajustes.modo === 'servidor') {
        await enviarAlServidor({ ...datos, consentimiento: true, turnstile: crudo['cf-turnstile-response'] ?? '' });
      } else {
        await new Promise((listo) => setTimeout(listo, 500)); // simulación: no sale ningún dato del navegador
      }
      formulario.reset();
      mostrarExito(datos.nombre.split(' ')[0]);
    } catch (error) {
      const li = document.createElement('li');
      li.textContent = t.errores[error.message === 'demasiados' ? 'demasiados' : 'servidor'];
      $('ul', resumen).replaceChildren(li);
      resumen.hidden = false;
      resumen.focus();
    } finally {
      enviar.disabled = false;
      enviar.textContent = t.enviar;
    }
  });

  // Al corregir un campo, su aviso de error se retira.
  formulario.addEventListener('input', (evento) => {
    const campo = evento.target.name;
    const parrafo = campo && $(`[data-error="${CSS.escape(campo)}"]`, formulario);
    if (!parrafo || parrafo.hidden) return;
    parrafo.hidden = true;
    parrafo.textContent = '';
    for (const control of controlesDe(campo)) control.removeAttribute('aria-invalid');
  });

  $('[data-form-otro]').addEventListener('click', () => {
    exito.hidden = true;
    formulario.hidden = false;
    formulario.elements.nombre.focus();
  });
}
