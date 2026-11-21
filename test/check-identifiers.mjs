// TypeScript checks references; this check verifies the host-facing loader interface.
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadClient } from './helpers/load-client.mjs';

const { plugin, ctx, dependencies, dictionaries, slots } = loadClient();
assert.equal(typeof plugin.apply, 'function');
assert.ok(Array.isArray(plugin.inject));
assert.ok(plugin.inject.includes('remote.mcpManager'));
plugin.apply(ctx);
assert.deepEqual([...dependencies], ['react']);
assert.equal(Object.keys(dictionaries['mcp.servers']).length, 8);
const Section = slots.get('settings.section');
const Icon = slots.get('settings.section.icon');
assert.equal(typeof Section, 'function');
assert.equal(typeof Icon, 'function');
assert.match(renderToStaticMarkup(createElement(Section)), /MCP servers/);
assert.match(renderToStaticMarkup(createElement(Icon)), /<svg/);
console.log('OK: unmodified client bundle loads, activates and renders through the DSH interface');
