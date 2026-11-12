# Decisiones de diseño y movimiento

Registro de cómo se aplicaron las skills de diseño del proyecto. Toda animación vive en la sección 17 de `sitio/assets/css/estilos.css` y usa una sola familia de curvas (`--ease-out`, `--ease-drawer`) y duraciones (`--d-toque` 140 ms, `--d-rapida` 180 ms, `--d-base` 240 ms, `--d-panel` 380 ms, `--d-revelar` 450 ms).

## Principios (emil-design-eng y apple-design)

- Respuesta al presionar, no al soltar: todo lo que se puede pulsar se encoge un poco (`scale(.97)`) en `:active`.
- Solo se animan `transform` y `opacity`. Nada de `transition: all`, ni de animar sombras, márgenes o tamaños.
- Las entradas usan `ease-out` fuerte; ninguna usa `ease-in`. La interfaz se queda por debajo de 300 ms; los paneles (bolsa, detalle en teléfono) pueden llegar a 380 ms.
- Los efectos de cursor solo existen donde hay cursor (`@media (hover: hover) and (pointer: fine)`).
- Encabezado translúcido, con respaldo sólido si se pide menos transparencia o más contraste.
- Tipografía: seguimiento negativo en títulos grandes, tamaño óptico automático de Fraunces, interlineado más abierto en el texto.
- Las ventanas crecen desde el centro; el panel de la bolsa entra y sale por el mismo lado.

## Dónde sí se anima (find-animation-opportunities)

| # | Lugar | Propósito | Frecuencia | Movimiento |
| --- | --- | --- | --- | --- |
| 1 | Botones, iconos, etiquetas | Respuesta | Decenas al día | `scale(.97)` en `:active`, 140 ms, `--ease-out` |
| 2 | Tarjeta de pieza | Respuesta (lo pide el encargo) | Decenas al día | Con cursor: tarjeta `scale(1.04)` y foto `scale(1.02)` más, 240 ms; la sombra es una capa que cambia de opacidad. Al toque: `scale(.98)` |
| 3 | Añadir a la bolsa | Respuesta | Ocasional | El botón dice "Añadida a tu bolsa" 1.6 s y el contador late una vez (320 ms) |
| 4 | Filtrar el catálogo | Evitar un cambio brusco | Ocasional | Las piezas que entran aparecen con opacidad y 8 px de ascenso, 240 ms, vía `@starting-style` |
| 5 | Ventana de detalle y aviso | Evitar un cambio brusco | Ocasional | `scale(.97)` → 1 en 240 ms; en teléfono sube 4 % en 380 ms |
| 6 | Panel de la bolsa | Consistencia espacial | Ocasional | Desliza desde la derecha, 380 ms, `--ease-drawer` |
| 7 | Secciones al hacer scroll | Lo pide el encargo | Una vez por visita | Opacidad y 10 px de ascenso, 450 ms, solo lo que aún no se ha visto |
| 8 | Confirmación del formulario | Deleite (momento raro) | Rara | La palomita se dibuja una vez, 420 ms |

## Dónde no (y por qué)

- **Portada (hero):** sin entrada animada. Es lo primero que se pinta; animarla retrasaría el contenido principal.
- **Resultados del buscador:** aparecen al instante. Escribir es de alta frecuencia.
- **Cantidades de la bolsa:** el número cambia sin animación; es un dato que se lee.
- **Botón flotante de WhatsApp:** sin pulso ni bucle. Un elemento permanente que se mueve distrae.
- **Contenido de la bolsa y del detalle:** no se escalona. Una sola entrada por contenedor: el panel los trae consigo.
- **Paralaje o seguimiento del cursor en fotos:** decoración sin propósito y molesta en teléfono.

## Coreografía (choreograph)

Pasos de "Cómo pedir", al entrar en pantalla:

| Elemento | Papel | Empieza | Duración | Movimiento |
| --- | --- | --- | --- | --- |
| Título de la sección | Protagonista | 0 ms | 450 ms | Opacidad + 10 px |
| Paso 1 | Apoyo | 0 ms | 450 ms | Opacidad + 10 px |
| Paso 2 | Apoyo | 90 ms | 450 ms | Igual |
| Paso 3 | Apoyo | 160 ms | 450 ms | Igual |
| Paso 4 | Apoyo | 210 ms | 450 ms | Igual |
| Números grandes, iconos | Estáticos | — | — | Van con su tarjeta |

El orden tiene significado (son pasos) y las pausas se acortan (90, 70, 50 ms) para que se lea como una ola. Al filtrar, las piezas nuevas entran con pausas de 0, 30, 55, 75, 90 y 100 ms como tope; las que ya estaban no se mueven. Con movimiento reducido todo aparece junto y sin desplazamiento.

## Revisión final

**review-animations** (leída de su archivo, porque está marcada como no invocable por el modelo):

| Antes | Después | Por qué |
| --- | --- | --- |
| Encabezado con `transition: border-color, box-shadow` | Solo `border-color`; sin sombra | La sombra obliga a repintar en cada fotograma |
| Tarjeta de categoría: `box-shadow` animada al pasar el cursor | Solo `transform` | Misma razón |
| Foto de tarjeta 380 ms, foto de categoría 600 ms | 240 ms ambas | La interfaz se queda por debajo de 300 ms |
| Colores de `:hover` de los botones sin condición | Solo con cursor | En táctil el color se quedaba "pegado" tras tocar |

Veredicto: aprobado tras estos cambios.

**remove-animations:** la aparición al hacer scroll es la candidata clásica a eliminarse. Se conserva porque el encargo la pide, pero reducida (de 600 a 450 ms y de 16 a 10 px), solo para lo que aún no se ha visto y con limpieza de clases al terminar. Se eliminaron la sombra animada del encabezado y la de las tarjetas de categoría.

**animation-performance:** se quitó una medición forzada del diseño al iniciar (ahora el observador informa la posición de cada bloque), ninguna animación usa propiedades de diseño ni variables CSS heredadas, y no se añadió `will-change`. Verificado desde el código y con Lighthouse; falta una grabación en un teléfono real de gama media.

**mobile-native:** resaltado de toque desactivado, `touch-action: manipulation` y texto no seleccionable en controles, campos a 16 px para evitar el acercamiento de iOS, zonas seguras con `viewport-fit=cover`, `theme-color` por esquema, sin `100vh` (se usa `dvh`), fila de más vendidos con desplazamiento nativo y ajuste (`scroll-snap`). No se desactivó el gesto de "tirar para recargar" porque es una página, no una aplicación. Nada de esto se puede dar por comprobado sin un teléfono real.

**break-ui:** el formulario se probó con campos vacíos, nombres largos y con guiones, correos raros y textos de 5 000 caracteres (`pruebas/navegador.mjs`). El catálogo se probó con un peor caso realista (`pruebas/peor-caso.mjs`): nombre de 60 caracteres con una palabra de 35, dos materiales largos, pieza sin foto ni descripción, categoría nueva de nombre largo con una sola pieza, y precios. Encontró dos roturas reales a 360 px, ya corregidas: la página se desbordaba 2 px y el detalle se salía de la pantalla (faltaba `overflow-wrap: anywhere` y `minmax(0, 1fr)` en dos rejillas). No se añadió un interruptor "datos de demostración / peor caso" dentro de la página: el peor caso se inyecta desde la prueba, en la frontera de datos.
