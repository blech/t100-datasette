// The vendored d3 builds are browser scripts (UMD) that set a global d3; run them in a sandbox for tests.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadD3() {
  const ctx = vm.createContext({});
  for (const f of ['d3-array.min.js', 'd3-geo.min.js']) {
    vm.runInContext(readFileSync(new URL(`../vendor/${f}`, import.meta.url), 'utf8'), ctx);
  }
  return ctx.d3;
}
