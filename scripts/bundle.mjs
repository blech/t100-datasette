// Bundles each page's JavaScript (the <script type="module"> entry points, found by reading the templates) into static/dist/,
// with hashed file names and a manifest the templates read (plugins/t100_assets.py). Run by `npm run bundle`, by CI and by the
// Docker image build; development doesn't need it, as the templates fall back to the source modules without a manifest.
import { build } from 'esbuild';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const staticDir = join(root, 'static');
const dist = join(staticDir, 'dist');

// every `script_url('charts/rollup.js')` or `src="/static/charts/rollup.js"` in a template names a page script
const entries = new Set();
for (const file of readdirSync(join(root, 'templates')).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(join(root, 'templates', file), 'utf8');
  for (const m of html.matchAll(/script_url\(\s*['"]([^'"]+)['"]\s*\)/g)) entries.add(m[1]);
}
if (!entries.size) throw new Error('No script_url(...) entry points found in templates/');

// modules import each other as /static/... as well as by relative path
const staticRoot = { name: 'static-root', setup(b) { b.onResolve({ filter: /^\/static\// }, (args) => ({ path: join(root, args.path) })); } };

rmSync(dist, { recursive: true, force: true });
const result = await build({
  entryPoints: Object.fromEntries([...entries].map((e) => [e.replace(/\.js$/, ''), join(staticDir, e)])),
  outdir: dist,
  entryNames: '[dir]/[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true, splitting: true, format: 'esm', minify: true, sourcemap: true, target: 'es2022',
  plugins: [staticRoot], metafile: true, logLevel: 'warning', legalComments: 'none',
});

// entry -> its file and the shared chunks it imports (all levels), as URLs, for the templates' modulepreload tags
const outputs = Object.fromEntries(Object.entries(result.metafile.outputs).map(([k, v]) => [resolve(root, k), v]));
const toUrl = (abs) => '/static/' + abs.slice(staticDir.length + 1);
const chunksOf = (abs, seen = new Set()) => {
  for (const imp of outputs[abs].imports.filter((i) => i.kind === 'import-statement')) {
    const target = resolve(root, imp.path);
    if (!seen.has(target)) { seen.add(target); chunksOf(target, seen); }
  }
  return seen;
};
const manifest = {};
for (const [abs, out] of Object.entries(outputs)) {
  if (!out.entryPoint) continue;
  const entry = resolve(root, out.entryPoint).slice(staticDir.length + 1);
  manifest[entry] = { file: toUrl(abs), imports: [...chunksOf(abs)].map(toUrl) };
}
writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 1));
const kb = (abs) => outputs[abs].bytes / 1024;
console.log(`${Object.keys(manifest).length} entry points, ${Object.keys(outputs).filter((o) => !o.endsWith('.map')).length} files, ` +
  `${Object.keys(outputs).filter((o) => !o.endsWith('.map')).reduce((s, o) => s + kb(o), 0).toFixed(0)} KB in static/dist/`);
