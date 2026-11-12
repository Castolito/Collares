/**
 * Auditoría Lighthouse en móvil y escritorio (rendimiento, accesibilidad,
 * buenas prácticas y SEO). Necesita `lighthouse` y Chrome o Edge instalados;
 * no forman parte del sitio. Ver README, "Pruebas".
 *
 *   node herramientas/servidor.mjs                 (en otra terminal)
 *   PRUEBAS_DEPS=/ruta/a/node_modules node pruebas/lighthouse.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const requerir = createRequire(path.join(process.env.PRUEBAS_DEPS ?? path.join(AQUI, 'node_modules'), 'x.js'));
const { default: lighthouse, desktopConfig } = await import(pathToFileURL(requerir.resolve('lighthouse')).href);
const lanzador = await import(pathToFileURL(requerir.resolve('chrome-launcher')).href);

const URL_BASE = process.argv[2] ?? 'http://localhost:4173/Collares/';
const INFORMES = path.join(AQUI, 'informes');
fs.mkdirSync(INFORMES, { recursive: true });

const chrome = await lanzador.launch({ chromeFlags: ['--headless=new', '--no-first-run'] });
let fallas = 0;
try {
  for (const [nombre, config] of [['movil', undefined], ['escritorio', desktopConfig]]) {
    const { lhr, report } = await lighthouse(URL_BASE, { port: chrome.port, output: 'html', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, config);
    fs.writeFileSync(path.join(INFORMES, `lighthouse-${nombre}.html`), report);
    const nota = (c) => Math.round(lhr.categories[c].score * 100);
    const notas = { rendimiento: nota('performance'), accesibilidad: nota('accessibility'), 'buenas prácticas': nota('best-practices'), SEO: nota('seo') };
    const a = lhr.audits;
    console.log(`\n${nombre.toUpperCase()}: ${Object.entries(notas).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    console.log(`  LCP ${a['largest-contentful-paint'].displayValue} · CLS ${a['cumulative-layout-shift'].displayValue} · TBT ${a['total-blocking-time'].displayValue} · peso ${(a['total-byte-weight'].numericValue / 1024).toFixed(0)} KB`);
    const pendientes = Object.values(lhr.categories).flatMap((c) => c.auditRefs)
      .filter((r) => r.weight > 0 && a[r.id].score !== null && a[r.id].score < 0.9 && !['metrics'].includes(r.group))
      .map((r) => `${r.id} (${a[r.id].score})`);
    if (pendientes.length) console.log(`  Con hallazgos: ${pendientes.join(', ')}`);
    if (Object.values(notas).some((v) => v < 90)) fallas += 1;
  }
} finally {
  await chrome.kill();
}
console.log(fallas ? '\nAlguna nota quedó por debajo de 90.' : '\nTodas las notas son de 90 o más. Informes en pruebas/informes/');
process.exitCode = fallas ? 1 : 0;
