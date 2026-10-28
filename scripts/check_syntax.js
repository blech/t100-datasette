// Every script under static/ parses: the page scripts (static/charts/airport.js and the like) aren't imported by any
// test, so a slip in one only shows in the browser. Vendored libraries are left alone. Run by `npm test`, before the tests.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const scripts = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === 'vendor' ? [] : scripts(join(dir, e.name))) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);

const failed = scripts('static').filter((file) => {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) process.stderr.write(res.stderr);
  return res.status !== 0;
});
if (failed.length) {
  console.error(`Syntax errors in ${failed.length} file${failed.length === 1 ? '' : 's'}: ${failed.join(', ')}`);
  process.exit(1);
}
