#!/usr/bin/env node
/**
 * Construye el sitio estático. No necesita instalar nada: solo Node 20 o superior.
 *
 *   node herramientas/construir.mjs
 *
 * Lee los datos de sitio/datos/ (config.json, textos.json y productos.json),
 * los combina con las plantillas de plantillas/ y escribe dentro de sitio/:
 *   index.html, 404.html, robots.txt, sitemap.xml, site.webmanifest,
 *   _headers (encabezados para Cloudflare Pages) y .well-known/security.txt
 *
 * Así el nombre de la marca, los datos de contacto y los textos viven en un
 * solo lugar y aun así la página se ve completa sin JavaScript.
 *
 * Variable opcional URL_SITIO: sustituye a config.sitio.url (la usa el flujo
 * de GitHub Actions para adaptarse a la dirección real de GitHub Pages).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { rellenar, contar } from '../sitio/assets/js/nucleo/texto.js';
import { normalizarCatalogo } from '../sitio/assets/js/nucleo/catalogo.js';
import { enlaceWhatsApp, enlaceTelefono, enlaceCorreo, numeroWhatsApp } from '../sitio/assets/js/nucleo/whatsapp.js';
import { MEDIOS, LIMITES, CAMPO_TRAMPA } from '../sitio/assets/js/nucleo/validacion.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITIO = path.join(RAIZ, 'sitio');
const VENDOR = 'assets/vendor/bootstrap-5.3.9';
const ANCHOS = [480, 768, 1280];

/* ---------- utilidades ---------- */

const leerJson = async (ruta) => JSON.parse(await fs.readFile(path.join(SITIO, ruta), 'utf8'));

/** Escapa texto para ponerlo dentro de HTML o de un atributo. */
export function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** JSON seguro para incrustar en una etiqueta <script> de datos. */
const jsonIncrustado = (dato) => JSON.stringify(dato).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');

/** Sustituye {marca}, {correo}... en todos los textos, sin tocar otras llaves. */
function resolver(valor, fichas) {
  if (typeof valor === 'string') return rellenar(valor, fichas);
  if (Array.isArray(valor)) return valor.map((v) => resolver(v, fichas));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, resolver(v, fichas)]));
  return valor;
}

const leerRuta = (objeto, ruta) => ruta.split('.').reduce((o, clave) => (o == null ? undefined : o[clave]), objeto);

async function integridad(ruta) {
  const datos = await fs.readFile(path.join(SITIO, ruta));
  return `sha384-${crypto.createHash('sha384').update(datos).digest('base64')}`;
}

/** Recorre los import de los módulos para precargarlos todos desde el HTML. */
async function modulosDe(entrada) {
  const vistos = new Set();
  async function visitar(ruta) {
    if (vistos.has(ruta)) return;
    vistos.add(ruta);
    const codigo = await fs.readFile(path.join(SITIO, ruta), 'utf8');
    for (const m of codigo.matchAll(/^\s*import\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      await visitar(path.posix.join(path.posix.dirname(ruta), m[1]));
    }
  }
  await visitar(entrada);
  vistos.delete(entrada);
  return [...vistos].sort();
}

/* ---------- construcción ---------- */

export async function construir({ urlSitio = process.env.URL_SITIO } = {}) {
  const config = await leerJson('datos/config.json');
  const textosCrudos = await leerJson('datos/textos.json');
  const catalogo = normalizarCatalogo(await leerJson('datos/productos.json'));
  for (const aviso of catalogo.avisos) console.warn(`  Aviso del catálogo: ${aviso}`);

  const url = new URL((urlSitio || config.sitio.url).replace(/\/*$/, '/'));
  const rutaBase = url.pathname; // "/Collares/" en GitHub Pages, "/" en un dominio propio
  const { marca, contacto, redes, sitio } = config;
  const prototipo = sitio.esPrototipo === true;

  const t = resolver(textosCrudos, {
    marca: marca.nombre,
    eslogan: marca.eslogan,
    correo: contacto.correo,
    telefono: contacto.telefono,
    horario: contacto.horario,
    zona: contacto.zona,
    ciudad: contacto.ciudad,
    estado: contacto.estado,
  });

  const wa = {
    general: enlaceWhatsApp(contacto.whatsapp, config.whatsapp.mensajeGeneral),
    pedido: enlaceWhatsApp(contacto.whatsapp, config.whatsapp.mensajePedidoDirecto),
  };
  const nuevaPestana = `<span class="visually-hidden"> (${esc(t.nuevaPestana)})</span>`;
  const externo = 'target="_blank" rel="noopener noreferrer"';
  const provisional = prototipo ? ` <span class="provisional">${esc(t.etiquetaProvisional)}</span>` : '';

  /* ----- piezas de HTML reutilizables ----- */

  const pagina = (base) => {
    const icono = (nombre, clase = '') =>
      `<svg class="icono${clase ? ` ${clase}` : ''}" aria-hidden="true" focusable="false"><use href="${base}assets/iconos/iconos.svg#i-${nombre}"></use></svg>`;

    const srcset = (f) => ANCHOS.map((a) => `${base}assets/fotos/${f.base}-${a}.webp ${a}w`).join(', ');
    const imagen = (f, { sizes, clase = '', prioridad = false, ancho = 1280, alto = 1600 }) =>
      `<img class="${clase}" src="${base}assets/fotos/${f.base}-768.webp" srcset="${srcset(f)}" sizes="${sizes}" width="${ancho}" height="${alto}" alt="${esc(f.alt)}"${
        prioridad ? ' fetchpriority="high"' : ' loading="lazy"'
      } decoding="async">`;

    const logo = marca.logo
      ? `<img class="marca__logo" src="${base}assets/logo/${esc(marca.logo)}" alt="${esc(marca.nombre)}" height="40">`
      : `${icono('marca', 'marca__ornamento')}<span class="marca__nombre">${esc(marca.nombre)}</span>`;

    return { icono, imagen, srcset, logo };
  };

  const inicio = pagina('');
  const { icono, imagen } = inicio;

  const enlacesNav = (clase) =>
    t.navegacion.enlaces.map((e) => `<li><a class="${clase}" href="#${esc(e.id)}" data-nav="${esc(e.id)}">${esc(e.texto)}</a></li>`).join('\n          ');

  const botonWhatsApp = (clase, tipo, texto, conIcono = true) =>
    `<a class="${clase}" href="${esc(wa[tipo])}" ${externo} data-whatsapp="${tipo}">${conIcono ? icono('whatsapp') : ''}<span>${esc(texto)}</span>${nuevaPestana}</a>`;

  /* ----- datos de contacto (enlace solo si el dato ya es real) ----- */

  const telefonoUrl = enlaceTelefono(contacto.telefono);
  const correoUrl = enlaceCorreo(contacto.correo);
  const hayNumero = numeroWhatsApp(contacto.whatsapp) !== '';
  const dato = (valor, enlace) => (enlace ? `<a href="${esc(enlace)}">${esc(valor)}</a>` : `${esc(valor)}${provisional}`);

  const filaContacto = (nombreIcono, etiqueta, contenido) =>
    `<div class="datos__fila"><dt>${icono(nombreIcono)}${esc(etiqueta)}</dt><dd>${contenido}</dd></div>`;
  const contactoDatos = [
    filaContacto('whatsapp', t.contacto.etiquetas.whatsapp, hayNumero ? `<a href="${esc(wa.general)}" ${externo} data-whatsapp="general">${esc(contacto.whatsapp)}${nuevaPestana}</a>` : `${esc(contacto.whatsapp)}${provisional}`),
    filaContacto('telefono', t.contacto.etiquetas.telefono, dato(contacto.telefono, telefonoUrl)),
    filaContacto('correo', t.contacto.etiquetas.correo, dato(contacto.correo, correoUrl)),
    filaContacto('lugar', t.contacto.etiquetas.zona, `${esc(t.contacto.zonaDetalle)}${provisional}`),
    filaContacto('reloj', t.contacto.etiquetas.horario, `${esc(contacto.horario)}${provisional}`),
  ].join('\n            ');

  const redSocial = (nombreIcono, etiqueta, href, tipoWa) =>
    `<li><a class="red" href="${esc(href)}" ${externo}${tipoWa ? ` data-whatsapp="${tipoWa}"` : ''} aria-label="${esc(`${etiqueta} (${t.nuevaPestana})`)}">${icono(nombreIcono)}</a></li>`;
  const listaRedes = [
    redSocial('instagram', t.contacto.instagram, redes.instagram.url),
    redSocial('facebook', t.contacto.facebook, redes.facebook.url),
    redSocial('whatsapp', t.contacto.whatsappRed, wa.general, 'general'),
  ].join('\n            ');

  /* ----- bloques de cada sección ----- */

  const vendidos = catalogo.productos.filter((p) => p.masVendido).length;
  const esqueleto = (n) =>
    Array.from({ length: n }, () => '<li class="pieza pieza--esqueleto" aria-hidden="true"><div class="esqueleto esqueleto--foto"></div><div class="esqueleto esqueleto--linea"></div><div class="esqueleto esqueleto--linea esqueleto--corta"></div></li>').join('\n          ');

  const bloques = {
    avisoPrototipo: prototipo ? `<aside class="aviso-prototipo" aria-label="${esc(t.avisoPrototipoEtiqueta)}"><p>${esc(t.avisoPrototipo)}</p></aside>` : '',
    logo: inicio.logo,
    navEscritorio: enlacesNav('encabezado__enlace'),
    navMovil: enlacesNav('menu-movil__enlace'),
    navPie: enlacesNav('pie__enlace'),
    botonPedidoBarra: botonWhatsApp('btn btn-acento encabezado__pedido', 'pedido', t.navegacion.pedido, false),
    botonPedidoMenu: botonWhatsApp('btn btn-acento menu-movil__pedido', 'pedido', t.navegacion.pedido, false),

    heroBotonWhatsApp: botonWhatsApp('btn btn-contorno btn-lg', 'general', t.hero.botonWhatsApp),
    heroDatos: t.hero.datos.map((d) => `<li>${esc(d)}</li>`).join(''),
    heroImagen: imagen(t.hero.foto, { sizes: '(min-width: 992px) 440px, (min-width: 576px) 420px, 60vw', clase: 'arco__foto', prioridad: true }),
    preloadHero: `<link rel="preload" as="image" type="image/webp" href="assets/fotos/${t.hero.foto.base}-768.webp" imagesrcset="${inicio.srcset(t.hero.foto)}" imagesizes="(min-width: 992px) 440px, (min-width: 576px) 420px, 60vw" fetchpriority="high">`,

    esqueletoCategorias: Array.from({ length: catalogo.categorias.length }, () => '<li class="categoria categoria--esqueleto" aria-hidden="true"><div class="esqueleto esqueleto--foto"></div></li>').join('\n          '),
    vendidosOculto: vendidos ? '' : ' hidden',
    esqueletoVendidos: esqueleto(vendidos),
    esqueletoRejilla: esqueleto(Math.min(8, catalogo.productos.length)),
    notaFotos: prototipo ? `<p class="nota-fotos">${esc(t.coleccion.notaFotos)}</p>` : '',
    sinJsColeccion: botonWhatsApp('btn btn-acento', 'general', t.coleccion.sinJsBoton),

    nosotrosImagen: imagen(t.nosotros.foto, { sizes: '(min-width: 992px) 46vw, 92vw', clase: 'nosotros__imagen', ancho: 1280, alto: 960 }),
    nosotrosParrafos: t.nosotros.parrafos.map((p) => `<p>${esc(p)}</p>`).join('\n          '),
    valores: t.nosotros.valores.map((v) => `<li class="valor">${icono(v.icono)}<div><h3 class="valor__titulo">${esc(v.titulo)}</h3><p>${esc(v.texto)}</p></div></li>`).join('\n            '),

    pasos: t.comoPedir.pasos
      .map((p, i) => `<li class="paso" data-revelar><span class="paso__numero" aria-hidden="true">${i + 1}</span><span class="paso__icono">${icono(p.icono)}</span><h3 class="paso__titulo"><span class="visually-hidden">${esc(rellenar(t.comoPedir.pasoEtiqueta, { n: i + 1 }))}: </span>${esc(p.titulo)}</h3><p>${esc(p.texto)}</p></li>`)
      .join('\n          '),

    preguntas: t.preguntas.lista
      .map((q, i) => `<div class="accordion-item pregunta">
            <h3 class="accordion-header"><button class="accordion-button collapsed pregunta__boton" type="button" data-bs-toggle="collapse" data-bs-target="#pregunta-${i + 1}" aria-expanded="false" aria-controls="pregunta-${i + 1}"><span>${esc(q.pregunta)}</span>${icono('chevron', 'pregunta__flecha')}</button></h3>
            <div id="pregunta-${i + 1}" class="accordion-collapse collapse"><div class="accordion-body pregunta__respuesta"><p>${esc(q.respuesta)}</p></div></div>
          </div>`)
      .join('\n          '),

    contactoBoton: botonWhatsApp('btn btn-acento btn-lg', 'general', t.contacto.botonWhatsApp),
    contactoDatos,
    redes: listaRedes,
    pieContacto: [
      `<li>${hayNumero ? `<a href="${esc(wa.general)}" ${externo} data-whatsapp="general">WhatsApp ${esc(contacto.whatsapp)}${nuevaPestana}</a>` : `WhatsApp ${esc(contacto.whatsapp)}`}</li>`,
      `<li>${correoUrl ? `<a href="${esc(correoUrl)}">${esc(contacto.correo)}</a>` : esc(contacto.correo)}</li>`,
      `<li>${esc(contacto.horario)}</li>`,
    ].join('\n            '),

    formularioAviso: config.formulario.modo === 'simulado' ? `<p class="formulario__aviso">${esc(t.formulario.avisoSimulado)}</p>` : '',
    formularioMedios: MEDIOS.map((m, i) => `<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="medio" id="medio-${m}" value="${m}"${i === 0 ? ' required aria-describedby="error-medio"' : ''}><label class="form-check-label" for="medio-${m}">${esc(t.formulario.medios[m])}</label></div>`).join('\n              '),
    formularioAyudaMensaje: esc(rellenar(t.formulario.mensajeAyuda, { max: LIMITES.mensaje })),

    privacidadSecciones: t.privacidad.secciones.map((s) => `<h3>${esc(s.titulo)}</h3>\n          <p>${esc(s.texto)}</p>`).join('\n          '),
    flotanteWhatsApp: `<a class="flotante flotante--whatsapp" href="${esc(wa.general)}" ${externo} data-whatsapp="general" aria-label="${esc(`${t.flotantes.whatsapp} (${t.nuevaPestana})`)}">${icono('whatsapp')}</a>`,
  };

  /* ----- política de seguridad de contenido: una sola definición para la etiqueta meta y para _headers ----- */

  const conTurnstile = Boolean(config.formulario.turnstileSiteKey);
  const csp = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...(conTurnstile ? ['https://challenges.cloudflare.com'] : [])],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'manifest-src': ["'self'"],
    'frame-src': conTurnstile ? ['https://challenges.cloudflare.com'] : ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
  };
  const cspTexto = (extra = {}) => Object.entries({ ...csp, ...extra }).map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k)).join('; ');
  // frame-ancestors y upgrade-insecure-requests solo funcionan como encabezado HTTP, no en la etiqueta meta.
  const cspEncabezado = cspTexto({ 'frame-ancestors': ["'none'"], 'upgrade-insecure-requests': [] });

  /* ----- datos estructurados (SEO) ----- */

  const absoluta = (ruta) => new URL(ruta, url).href;
  const organizacion = {
    '@type': 'Organization',
    '@id': `${url.href}#organizacion`,
    name: marca.nombre,
    url: url.href,
    description: marca.descripcion,
    slogan: marca.eslogan,
    logo: absoluta('assets/img/icono-512.png'),
    image: absoluta('assets/img/compartir.jpg'),
    address: { '@type': 'PostalAddress', addressLocality: contacto.ciudad, addressRegion: contacto.estado, addressCountry: contacto.pais },
    areaServed: { '@type': 'Country', name: 'México' },
    knowsAbout: ['Joyería hecha a mano', 'Collares de perlas', 'Aretes de piedras naturales'],
  };
  // Los datos de contacto y las redes solo se publican para buscadores cuando ya son reales.
  if (telefonoUrl) organizacion.telephone = telefonoUrl.replace('tel:', '');
  if (correoUrl) organizacion.email = contacto.correo;
  if (!prototipo) organizacion.sameAs = [redes.instagram.url, redes.facebook.url];

  const productosLd = {
    '@type': 'ItemList',
    name: t.coleccion.titulo,
    numberOfItems: catalogo.productos.length,
    itemListElement: catalogo.productos.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        '@id': `${url.href}#${p.id}`,
        name: p.nombreCompleto,
        description: p.descripcion,
        sku: p.id,
        category: p.categoria.nombre,
        material: p.material,
        image: p.fotos.map((f) => absoluta(`assets/fotos/${f.base}-1280.webp`)),
        brand: { '@type': 'Brand', name: marca.nombre },
        ...(p.precio !== null && {
          offers: { '@type': 'Offer', price: p.precio, priceCurrency: config.catalogo.moneda, availability: 'https://schema.org/InStock', url: `${url.href}#coleccion` },
        }),
      },
    })),
  };
  const preguntasLd = {
    '@type': 'FAQPage',
    mainEntity: t.preguntas.lista.map((q) => ({ '@type': 'Question', name: q.pregunta, acceptedAnswer: { '@type': 'Answer', text: q.respuesta } })),
  };
  const sitioLd = { '@type': 'WebSite', '@id': `${url.href}#sitio`, url: url.href, name: marca.nombre, inLanguage: sitio.idioma, publisher: { '@id': `${url.href}#organizacion` } };
  bloques.jsonLd = `<script type="application/ld+json">${jsonIncrustado({ '@context': 'https://schema.org', '@graph': [organizacion, sitioLd, productosLd, preguntasLd] })}</script>`;

  /* ----- datos que necesita el JavaScript de la página (nunca secretos) ----- */

  const { meta, privacidad, nosotros, comoPedir, preguntas, pie, error404, hero, navegacion, contacto: _c, ...textosInterfaz } = t;
  bloques.datosSitio = `<script type="application/json" id="datos-sitio">${jsonIncrustado({
    marca: { nombre: marca.nombre },
    esPrototipo: prototipo,
    bootstrap: { src: `${VENDOR}/bootstrap.min.js`, integridad: await integridad(`${VENDOR}/bootstrap.min.js`) },
    contacto: { whatsapp: contacto.whatsapp },
    whatsapp: config.whatsapp,
    bolsa: config.bolsa,
    catalogo: config.catalogo,
    formulario: { ...config.formulario, campoTrampa: CAMPO_TRAMPA, maxMensaje: LIMITES.mensaje },
    textos: textosInterfaz,
  })}</script>`;

  const modulos = await modulosDe('assets/js/principal.js');
  bloques.modulepreload = modulos.map((m) => `<link rel="modulepreload" href="${m}">`).join('\n  ');

  /* ----- valores sueltos para las plantillas ----- */

  const valores = {
    idioma: sitio.idioma,
    marca: marca.nombre,
    eslogan: marca.eslogan,
    url: url.href,
    urlImagen: absoluta('assets/img/compartir.jpg'),
    robots: sitio.indexar === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    csp: cspTexto(),
    vendor: VENDOR,
    sriCss: await integridad(`${VENDOR}/bootstrap.min.css`),
    sriJs: await integridad(`${VENDOR}/bootstrap.min.js`),
    anio: new Date().getFullYear(),
    campoTrampa: CAMPO_TRAMPA,
    maxNombre: LIMITES.nombre,
    maxCorreo: LIMITES.correo,
    maxMensaje: LIMITES.mensaje,
    irInicio: `${marca.nombre}, ir al inicio`,
    t,
    c: config,
  };

  function renderizar(plantilla, base, extra = {}) {
    const propios = pagina(base);
    return plantilla
      .replace(/\{\{\{\s*icono\.([\w-]+)\s*\}\}\}/g, (_, nombre) => propios.icono(nombre))
      .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (todo, clave) => {
        const html = clave === 'logo' ? propios.logo : (extra[clave] ?? bloques[clave]);
        if (html === undefined) throw new Error(`La plantilla pide un bloque que no existe: ${todo}`);
        return html;
      })
      .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (todo, clave) => {
        const valor = clave === 'base' ? base : leerRuta(valores, clave);
        if (valor === undefined) throw new Error(`La plantilla pide un dato que no existe: ${todo}`);
        return esc(valor);
      });
  }

  /* ----- escribir archivos ----- */

  const aviso = '<!-- ARCHIVO GENERADO por herramientas/construir.mjs. No lo edites: cambia plantillas/ o sitio/datos/ y vuelve a construir. -->\n';
  const salidas = {
    'index.html': aviso + renderizar(await fs.readFile(path.join(RAIZ, 'plantillas/index.html'), 'utf8'), ''),
    // La página 404 puede mostrarse desde cualquier ruta, así que usa direcciones completas desde la raíz del sitio.
    '404.html': aviso + renderizar(await fs.readFile(path.join(RAIZ, 'plantillas/404.html'), 'utf8'), rutaBase),
    'robots.txt': sitio.indexar === false ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${absoluta('sitemap.xml')}\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${esc(url.href)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`,
    'site.webmanifest': `${JSON.stringify({
      name: marca.nombre,
      short_name: marca.nombre,
      description: marca.descripcion,
      lang: sitio.idioma,
      start_url: './',
      scope: './',
      display: 'browser',
      background_color: '#FAF4EA',
      theme_color: '#7A4B2A',
      icons: [
        { src: 'assets/img/icono-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'assets/img/icono-512.png', sizes: '512x512', type: 'image/png' },
      ],
    }, null, 2)}\n`,
    '.well-known/security.txt': `# Cómo avisarnos de un problema de seguridad en este sitio.\nContact: mailto:${config.seguridad.contacto}\nExpires: ${config.seguridad.expira}\nPreferred-Languages: es, en\nCanonical: ${absoluta('.well-known/security.txt')}\n`,
    _headers: `# Encabezados de seguridad para Cloudflare Pages (versión final).
# GitHub Pages IGNORA este archivo: ahí solo aplica la etiqueta <meta> de index.html.
# ARCHIVO GENERADO por herramientas/construir.mjs. No lo edites a mano.

/*
  Content-Security-Policy: ${cspEncabezado}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin

/assets/vendor/*
  Cache-Control: public, max-age=31536000, immutable

/assets/fuentes/*
  Cache-Control: public, max-age=2592000

/assets/fotos/*
  Cache-Control: public, max-age=604800

/assets/img/*
  Cache-Control: public, max-age=604800

/assets/iconos/*
  Cache-Control: public, max-age=86400

/assets/css/*
  Cache-Control: public, max-age=3600

/assets/js/*
  Cache-Control: public, max-age=3600

/datos/*
  Cache-Control: public, max-age=300
`,
  };

  for (const [ruta, contenido] of Object.entries(salidas)) {
    const destino = path.join(SITIO, ruta);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, contenido, 'utf8');
  }

  return {
    url: url.href,
    rutaBase,
    archivos: Object.keys(salidas),
    productos: catalogo.productos.length,
    categorias: catalogo.categorias.map((c) => `${c.nombre} (${contar(c.total, '1 pieza', '{n} piezas')})`),
    prototipo,
    numeroReal: hayNumero,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  construir()
    .then((r) => {
      console.log(`Sitio construido para ${r.url}`);
      console.log(`  ${r.productos} productos en ${r.categorias.join(' y ')}`);
      console.log(`  Archivos: ${r.archivos.join(', ')}`);
      if (r.prototipo) console.log('  Modo prototipo activo (config.sitio.esPrototipo): se muestran los avisos de contenido provisional.');
      if (!r.numeroReal) console.log('  El WhatsApp aún es un marcador: los enlaces abren WhatsApp con el mensaje, pero sin destinatario.');
    })
    .catch((error) => {
      console.error(`No se pudo construir el sitio: ${error.message}`);
      process.exit(1);
    });
}
