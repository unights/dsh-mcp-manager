// Guard the stylesheet extraction: scope, balance, and that the bundle carries it.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadClient } from './helpers/load-client.mjs';

const css = readFileSync(new URL('../src/client/style.css', import.meta.url), 'utf8');
const loaded = loadClient();
loaded.plugin.apply(loaded.ctx);
const markup = renderToStaticMarkup(createElement(loaded.slots.get('settings.section')));

const failures = [];
const check = (label, condition, detail) => {
  if (!condition) failures.push(label + (detail === undefined ? '' : ' → ' + JSON.stringify(detail)));
};

// ── the source file ─────────────────────────────────────────────────────
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const open = (withoutComments.match(/\{/g) || []).length;
const close = (withoutComments.match(/\}/g) || []).length;
check('braces balance', open === close, { open, close });

const lines = withoutComments
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '');

const selectors = lines.filter((line) => !line.startsWith('@') && !/^[});]/.test(line) && !line.includes('{') === false);
const ruleLines = lines.filter((line) => line.includes('{'));

const unscoped = [];
for (const line of ruleLines) {
  if (line.startsWith('@')) continue;
  const head = line.slice(0, line.indexOf('{'));
  // every comma-separated selector part must be scoped to .mcps_
  for (const part of head.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    if (!/^\.mcps_[A-Za-z0-9_-]*/.test(trimmed)) unscoped.push(trimmed);
  }
}
check('every selector is scoped to .mcps_', unscoped.length === 0, unscoped.slice(0, 5));

// a bare element or universal selector would restyle the Host console
const bare = lines.filter((line) => /^[a-z][a-z0-9]*[\s,{]/.test(line) && !line.startsWith('@'));
check('no bare element selectors', bare.length === 0, bare.slice(0, 5));

const classes = [...new Set([...css.matchAll(/\.(mcps_[\w-]*)/g)].map((m) => m[1]))];
check('stylesheet declares classes', classes.length > 50, classes.length);

// ── the bundle ──────────────────────────────────────────────────────────
// The generated loader must pass the stylesheet through the public Section props.
const styles = [...markup.matchAll(/<style\b[^>]*data-plugin-css="mcp-servers"[^>]*>([\s\S]*?)<\/style>/g)];
check('the stylesheet is injected once', styles.length === 1, styles.length);
if (styles.length === 1) {
  const inlined = styles[0][1];
  check('inlined stylesheet matches the source', inlined === css);
  const missing = classes.filter(name => !inlined.includes('.' + name));
  check('every class survived the build', missing.length === 0, missing);
  const tokens = [...new Set([...css.matchAll(/var\(--dsw-alias-[a-z0-9-]+/g)].map(match => match[0]))];
  check('theme tokens preserved', tokens.every(token => inlined.includes(token)));
  console.log(`stylesheet: ${ruleLines.length} rule lines, ${classes.length} classes, ${tokens.length} theme tokens`);
}

if (failures.length > 0) {
  console.error('FAIL (' + String(failures.length) + ')');
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}
console.log('OK: stylesheet scoped, balanced, and inlined into the bundle');
