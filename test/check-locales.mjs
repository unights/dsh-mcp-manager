// Check the dictionaries actually registered by the shipped loader, not generated formatting.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { en } from '../src/client/locale/en.ts';
import { loadClient } from './helpers/load-client.mjs';

const { plugin, ctx, dictionaries } = loadClient();
plugin.apply(ctx);
const registered = dictionaries['mcp.servers'];
const locales = ['en', 'zh', 'ja', 'es', 'fr', 'de', 'ru', 'pt'];
const keys = Object.keys(en).sort();
for (const locale of locales) {
  assert.deepEqual(Object.keys(registered[locale]).sort(), keys, locale + ' dictionary keys differ');
  assert.ok(Object.values(registered[locale]).every(value => typeof value === 'string'));
  const metadata = JSON.parse(readFileSync(new URL('../locale/' + locale + '.json', import.meta.url), 'utf8'));
  assert.ok(metadata.meta?.title && metadata.meta?.description, locale + ' metadata missing');
}
const referenced = new Set();
const root = new URL('../src/client/', import.meta.url);
for (const entry of readdirSync(root, { recursive: true })) {
  if (!entry.endsWith('.ts') || entry.includes('locale')) continue;
  const file = ts.createSourceFile(entry, readFileSync(new URL(entry.replaceAll('\\', '/'), root), 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't' &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      assert.ok(Object.hasOwn(en, key), entry + ': missing translation ' + key);
      referenced.add(key);
    }
    // Indirect keys in presentation maps and operation options remain syntax-independent.
    if (ts.isStringLiteral(node) && Object.hasOwn(en, node.text)) referenced.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
}
console.log(`OK: ${keys.length} keys in each of ${locales.length} registered dictionaries; ${referenced.size} referenced keys; metadata present`);
