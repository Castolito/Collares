# Collares · landing page (prototipo)

Página de una sola vista para una marca de joyería hecha a mano en Guadalajara, Jalisco. Presenta la marca, muestra un catálogo interactivo de collares y aretes y lleva a la persona a terminar su pedido por WhatsApp. No es una tienda en línea: no hay pagos ni cuentas.

> **Estado: prototipo.** El nombre "Collares", los textos, las piezas, las fotos y los datos de contacto son provisionales. La lista completa está en [Lo provisional](#lo-provisional).

## Contenido

1. [Cómo verla en tu computadora](#cómo-verla-en-tu-computadora)
2. [Cómo está organizado](#cómo-está-organizado)
3. [Cambiar el nombre de la marca y los datos de contacto](#cambiar-el-nombre-de-la-marca-y-los-datos-de-contacto)
4. [Cambiar los textos](#cambiar-los-textos)
5. [Cambiar los productos](#cambiar-los-productos)
6. [Cambiar las fotos](#cambiar-las-fotos)
7. [Publicar en GitHub Pages](#publicar-en-github-pages)
8. [Seguridad](#seguridad)
9. [Pruebas](#pruebas)
10. [Lo provisional](#lo-provisional)
11. [Pendientes para la versión final](#pendientes-para-la-versión-final)
12. [A futuro: Shopify y el bot de WhatsApp](#a-futuro-shopify-y-el-bot-de-whatsapp)

## Cómo verla en tu computadora

Solo necesitas [Node.js](https://nodejs.org) 20 o superior. No hay nada que instalar.

```bash
node herramientas/servidor.mjs
```

Abre la dirección que aparece (por omisión `http://localhost:4173/Collares/`). El servidor reconstruye el sitio al arrancar; si cambias datos o plantillas, deténlo con Ctrl + C y vuelve a iniciarlo.

No abras `index.html` con doble clic: el catálogo necesita un servidor para cargar.

## Cómo está organizado

```
sitio/                  Lo que se publica (sitio estático, rutas relativas)
  datos/                ← AQUÍ se cambia el contenido
    config.json           nombre de la marca, contacto, redes, WhatsApp, ajustes
    textos.json           todos los textos de la página
    productos.json        catálogo
  assets/
    css/  js/             estilos y JavaScript (módulos, sin librerías extra)
    fotos/  logo/  img/   fotos del catálogo, logo e imágenes de interfaz
    fuentes/  iconos/     tipografías Fraunces y Figtree, iconos SVG propios
    vendor/               Bootstrap 5.3.9 (versión fija, sin modificar)
  index.html, 404.html, robots.txt, sitemap.xml, _headers…   GENERADOS: no los edites
plantillas/             Estructura HTML de index y 404
herramientas/           construir.mjs, servidor.mjs, imagenes.mjs
functions/api/          Función del formulario para Cloudflare (versión final)
pruebas/                Pruebas automáticas
docs/                   Decisiones de diseño y movimiento
```

**La regla de oro:** el contenido vive en `sitio/datos/`. Después de cambiar cualquier archivo de esa carpeta (o de `plantillas/`), ejecuta:

```bash
node herramientas/construir.mjs
```

Eso regenera `index.html` y los demás archivos marcados como generados. Así el nombre de la marca y el contacto se cambian en un solo lugar y, aun así, la página se ve completa con JavaScript desactivado. Si publicas con GitHub Actions, el sitio se reconstruye solo en cada envío.

El JavaScript está dividido en tres capas: `nucleo/` (lógica pura y con pruebas: WhatsApp, bolsa, filtros, validación), `fuentes/` (de dónde sale el catálogo) y `ui/` (lo que toca la página). Ningún dato se inserta como HTML: todo se crea con nodos y texto.

## Cambiar el nombre de la marca y los datos de contacto

Todo está en `sitio/datos/config.json`:

| Qué | Dónde |
| --- | --- |
| Nombre de la marca | `marca.nombre` (se usa en toda la página, el título, los datos para buscadores y el pie) |
| Eslogan | `marca.eslogan` |
| Logo | Copia el archivo a `sitio/assets/logo/` y escribe su nombre en `marca.logo` (por ejemplo `"logo.svg"`). Vacío = se muestra el nombre con un ornamento dorado |
| Teléfono, correo, WhatsApp, zona, horario | `contacto` |
| Instagram y Facebook | `redes` |
| Mensajes de WhatsApp | `whatsapp` |
| Tope de la bolsa | `bolsa.maxPorPieza` y `bolsa.maxPiezasDistintas` |
| Dirección pública del sitio | `sitio.url` |
| Quitar los avisos de prototipo | `sitio.esPrototipo: false` |

Dos comportamientos pensados para no presentar datos falsos como reales:

- **WhatsApp.** El enlace se construye a partir de `contacto.whatsapp`. Mientras sea un marcador (`+52 312 XXX XXXX`), los botones abren WhatsApp con el mensaje ya escrito pero sin destinatario. En cuanto pongas el número real (10 dígitos o con `+52`), todos los botones abren ese chat.
- **Teléfono y correo.** Mientras sean marcadores (`XXX`, `@ejemplo.com`) se muestran como texto con la etiqueta "provisional" y sin enlace. Con datos reales se vuelven enlaces automáticamente.

Si cambias `bolsa.clave`, las bolsas guardadas en los navegadores de las personas se reinician.

## Cambiar los textos

Todos los textos están en `sitio/datos/textos.json`, agrupados por sección (`hero`, `nosotros`, `comoPedir`, `preguntas`, `formulario`, `privacidad`…). Puedes usar `{marca}`, `{eslogan}`, `{correo}`, `{telefono}`, `{horario}`, `{zona}`, `{ciudad}` y `{estado}` dentro de cualquier texto y se sustituyen solos.

Las preguntas frecuentes (`preguntas.lista`) generan también los datos estructurados para buscadores.

**Eslogan.** Se usa la opción 1. Las otras dos quedan aquí para que elijas:

1. "Perlas, piedras y paciencia." (en uso)
2. "Joyería hecha con calma, para llevar con gusto."
3. "De nuestras manos a las tuyas."

## Cambiar los productos

`sitio/datos/productos.json`. Cada producto:

```json
{
  "id": "collar-luna-de-agua",
  "categoria": "Collares",
  "nombre": "Luna de Agua",
  "material": "Perlas",
  "descripcion": "Texto breve.",
  "precio": null,
  "masVendido": true,
  "fotos": [{ "base": "collar-luna-de-agua", "alt": "Descripción de la foto." }],
  "caracteristicas": [{ "etiqueta": "Largo", "valor": "45 cm" }]
}
```

- `id`: único, en minúsculas, con guiones. Es lo que guarda la bolsa.
- `categoria`: el texto tal cual se mostrará. **Una categoría nueva (por ejemplo "Pulseras") aparece sola** en las tarjetas de categoría, en los filtros y en el buscador; no hay que tocar código. Opcionalmente, en `categorias` puedes darle su singular, el texto del botón y el mensaje de WhatsApp.
- `material`: un texto, o una lista si lleva dos (`["Perlas", "Cuarzo rosa"]`). Los filtros de material se generan a partir de aquí.
- `precio`: `null` muestra "Consulta precio por WhatsApp". **Al poner un número se muestra el precio y se activa solo el filtro de precio.**
- `masVendido`: `true` la incluye en "Los más vendidos". Si ninguna lo tiene, esa sección no aparece.
- `fotos`: una o varias. Con más de una, el detalle muestra una galería.

Los datos mal formados se descartan con un aviso en la consola en vez de romper la página.

## Cambiar las fotos

Las fotos viven en `sitio/assets/fotos/` en WebP y en tres anchos: `nombre-480.webp`, `nombre-768.webp` y `nombre-1280.webp`. En `productos.json` solo se escribe el `nombre` (campo `base`).

Para preparar fotos nuevas hace falta la herramienta `sharp`, que **no forma parte del sitio**. Instálala en una carpeta aparte para no mezclarla con el proyecto:

```bash
mkdir ../herramientas-fotos && cd ../herramientas-fotos && npm install sharp
```

Luego, con las fotos originales en una carpeta (el nombre de cada archivo será el nombre del producto):

```bash
node herramientas/imagenes.mjs fotos ruta/a/mis-fotos
```

El script recorta a proporción 4:5, genera los tres tamaños y te imprime las líneas listas para pegar en `productos.json`. También crea la imagen para compartir (`compartir`) y los iconos del sitio a partir de un SVG (`favicon`); las instrucciones están al inicio del archivo. Si `sharp` no está junto al proyecto, pídele a Claude Code que ejecute el script por ti.

Al llegar las fotos reales: procesa, actualiza `base` y `alt` en `productos.json`, borra los archivos `ejemplo-*`, actualiza `CREDITOS.md` y reconstruye.

## Publicar en GitHub Pages

El repositorio incluye el flujo `.github/workflows/pages.yml`.

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (una sola vez). El repositorio debe ser público, o la cuenta tener un plan que permita Pages en privados.
2. Sube los cambios a la rama `master` (o `main`).
3. El flujo ejecuta las pruebas de lógica, reconstruye el sitio **con la dirección real de Pages** y lo publica. La dirección queda en la pestaña *Actions* y en *Settings → Pages*.

El sitio usa rutas relativas, así que funciona igual bajo una subruta (`usuario.github.io/Collares/`) que en la raíz de un dominio. Si cambias de dominio, actualiza `sitio.url` en `config.json`.

Para reforzar la cadena de suministro puedes fijar cada acción del flujo a su identificador de versión exacto (commit) en lugar de la etiqueta `v7`, `v6`…

## Seguridad

### Lo que ya está activo en el prototipo

- **Política de seguridad de contenido (CSP)** en una etiqueta `<meta>`: solo se cargan recursos del propio sitio. Sin scripts ni estilos en línea, sin `data:`, sin marcos, sin `<base>`.
- **Cero recursos externos:** Bootstrap, tipografías, iconos e imágenes están dentro del proyecto, con versión fija. Bootstrap se sirve sin modificar y con verificación de integridad (SRI).
- **Sin `innerHTML`:** todo dato (catálogo, formulario, `localStorage`) se escribe como texto.
- **Bolsa:** guarda solo identificadores y cantidades; lo que se lee de `localStorage` se valida y se sanea antes de usarse.
- **Entradas validadas y saneadas**, con la misma lógica que usará el servidor.
- **Enlaces externos** con `rel="noopener noreferrer"`; `referrer` limitado con una etiqueta meta.
- **Ningún secreto en el código.** El correo que recibirá los pedidos no aparece en el sitio.
- **Privacidad:** aviso accesible desde el pie y el formulario, casilla de consentimiento, sin cookies de rastreo ni analítica de terceros.
- `robots.txt`, `sitemap.xml` y `.well-known/security.txt`.

### Lo que queda pendiente hasta pasar a Cloudflare Pages

GitHub Pages no permite encabezados de seguridad propios. El archivo `sitio/_headers` (generado, listo para Cloudflare) los define, pero **hoy no se aplican**:

| Protección | Por qué importa |
| --- | --- |
| `Strict-Transport-Security` | Obliga a usar siempre HTTPS |
| `X-Content-Type-Options: nosniff` | Evita que el navegador "adivine" tipos de archivo |
| `frame-ancestors 'none'` y `X-Frame-Options` | Impide incrustar el sitio en otra página (no funciona desde `<meta>`) |
| `Referrer-Policy` y `Permissions-Policy` como encabezado | Versión completa de lo que hoy va en `<meta>` |
| CSP como encabezado, con `upgrade-insecure-requests` | La versión estricta equivalente |
| Aislamiento entre orígenes (COOP/CORP) | Defensa adicional |

También pendiente para la versión final:

- **Formulario real.** `functions/api/contacto.js` ya valida, limita solicitudes por IP y verifica Turnstile (probado con `pruebas/servidor.mjs`), pero falta: elegir el servicio de correo y completar `enviarCorreo`; crear el almacén KV `LIMITE`; definir `CORREO_DESTINO` (por ejemplo `pedidos@ejemplo.com`, **como variable del servidor**) y `TURNSTILE_SECRETO`; poner la clave pública en `formulario.turnstileSiteKey`, añadir el widget al formulario y cambiar `formulario.modo` a `"servidor"`. Al poner la clave pública, el script de construcción añade `challenges.cloudflare.com` a la CSP automáticamente.
- **`security.txt`:** poner un correo real y renovar la fecha `seguridad.expira` antes de que venza.
- **Aviso de privacidad:** es un borrador; debe revisarlo un profesional.

Puedes probar los encabezados en local con `node herramientas/servidor.mjs --cabeceras`.

## Pruebas

Sin instalar nada:

```bash
node --test pruebas/unitarias.mjs pruebas/servidor.mjs
```

Las pruebas de navegador y Lighthouse usan herramientas que **no forman parte del sitio** (`playwright-core`, `axe-core`, `lighthouse`) y Chrome o Edge. Instálalas en una carpeta aparte y pásala en `PRUEBAS_DEPS`:

```bash
node herramientas/servidor.mjs
PRUEBAS_DEPS=/ruta/a/node_modules node pruebas/navegador.mjs
PRUEBAS_DEPS=/ruta/a/node_modules node pruebas/peor-caso.mjs
PRUEBAS_DEPS=/ruta/a/node_modules node pruebas/lighthouse.mjs
```

Resultados de la última ejecución (servidor local):

| Prueba | Resultado |
| --- | --- |
| Lógica y función del servidor | 18 de 18 |
| Navegador: 9 anchos, WhatsApp, bolsa, filtros, detalle, buscador, menú, formulario, teclado, sin JavaScript, 404, axe en claro y oscuro | 131 de 131 |
| Peor caso de datos (nombres larguísimos, sin fotos, categoría nueva, con precios) | 14 de 14 |
| Lighthouse escritorio | 100 · 100 · 100 · 100 |
| Lighthouse móvil | rendimiento 91-92 · accesibilidad 100 · buenas prácticas 100 · SEO 100 |

Peso de la página inicial: alrededor de 410 KB. CLS de 0 a 0.02.

Lo que estas pruebas **no** cubren y conviene revisar a mano: un teléfono real (iPhone y Android), un lector de pantalla real y el envío efectivo a WhatsApp con el número definitivo.

## Lo provisional

- Nombre de la marca ("Collares") y logotipo (nombre en tipografía de títulos con ornamento).
- Eslogan, título del inicio y todos los textos de `textos.json`, incluidas las preguntas frecuentes.
- Las 20 piezas: nombres, descripciones y **todas las características** (tipo de piedra, largo, cierre, metal, peso) son inventadas con realismo. Sin precios.
- Las 10 fotos, de bancos de imágenes (ver `CREDITOS.md`). Varias piezas comparten foto y algunas no corresponden a su material; por eso la página dice "Foto de ejemplo".
- Teléfono, correo, WhatsApp, zona, horario, Instagram y Facebook. **Ojo:** los enlaces de Instagram y Facebook apuntan, como se pidió, a `instagram.com/collares` y `facebook.com/collares`, que son cuentas de terceros hasta que se definan las reales.
- La dirección del sitio (`https://castolito.github.io/Collares/`).
- El aviso de privacidad (borrador).
- El tema oscuro: es una propuesta derivada de la paleta, para respetar la preferencia del sistema.
- Iconos del sitio (favicon) e imagen para compartir.
- La paleta y las tipografías sí son las indicadas; no son provisionales.

## Pendientes para la versión final

1. Definir nombre, logo, textos, catálogo, precios y fotos reales.
2. Poner los datos de contacto y redes reales y `sitio.esPrototipo: false`.
3. Desplegar en Cloudflare Pages (carpeta de salida `sitio`, comando `node herramientas/construir.mjs`) y comprobar que `_headers` se aplica.
4. Activar el formulario real (ver [Seguridad](#seguridad)).
5. Revisión profesional del aviso de privacidad. Si se suman políticas de envíos, cambios y garantía, añadirlas.
6. Probar en teléfonos reales y con lector de pantalla.
7. Conectar el bot de WhatsApp.

## A futuro: Shopify y el bot de WhatsApp

### Migrar el catálogo a Shopify

La página nunca lee `productos.json` directamente: pide el catálogo a una "fuente" (`sitio/assets/js/fuentes/`) y recibe siempre la misma forma de datos. Para migrar:

1. Completar `fuentes/catalogo-shopify.js` (hay un esqueleto con la consulta y el mapeo) usando la Storefront API y su token **público**. El token de administración nunca debe ir en el sitio.
2. En `principal.js`, importar esa fuente en lugar de `catalogo-json.js`, y poner los datos de la tienda en `config.json` → `catalogo`.
3. En `herramientas/construir.mjs`, añadir el dominio de la tienda a `connect-src` y el de sus imágenes a `img-src`.
4. Permitir fotos por dirección completa además de por nombre (`nucleo/catalogo.js` e `imagen()` en `ui/dom.js`).
5. Usar el identificador de Shopify como `id` del producto para que la bolsa siga funcionando, y decidir si la bolsa se convierte en un carrito real o sigue terminando en WhatsApp.

Filtros, buscador, detalle, bolsa y mensajes no cambian.

### Conectar el bot de WhatsApp

Todos los enlaces y mensajes salen de un solo archivo: `sitio/assets/js/nucleo/whatsapp.js`, con las plantillas en `config.json` → `whatsapp`.

- Las plantillas de pieza aceptan `{id}`, el identificador estable del producto, para que el bot lo reconozca sin interpretar texto libre. Ejemplo: `"Hola, me interesa el collar {nombre}. [ref: {id}]"`.
- Con `whatsapp.incluirIdEnBolsa: true`, cada línea del pedido lleva su identificador: `1 x Collar Rocío [collar-rocio]`.
- Si el bot usa la API de WhatsApp Business, basta con poner su número en `contacto.whatsapp`.
- Si más adelante el pedido debe enviarse al bot por servidor (sin abrir el chat), el punto de cambio es `pedido()` en `ui/bolsa.js`: ahí ya está la lista de piezas y cantidades.
