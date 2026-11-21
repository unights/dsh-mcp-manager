import assert from 'node:assert/strict';
import test from 'node:test';
import { readSettingsDocument } from '../src/client/api.ts';

const entry = {
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
  env: { TOKEN: 'secret' },
  cwd: 'D:/servers',
  enabled: true,
};

function document(namespaces) {
  return { writable: true, namespaces };
}

function namespace(ns, value, revision = 1, user) {
  return { ns, value, revision, ...(user === undefined ? {} : { user }) };
}

test('exact manager namespace wins over unrelated servers fields', () => {
  const result = readSettingsDocument(document([
    namespace('other-plugin', { servers: [] }, 9),
    namespace('other-shape', { servers: { value: { unrelated: true } } }, 10),
    namespace('mcp-manager', { servers: { demo: entry } }, 11),
  ]));
  assert.deepEqual(result.namespaces, [namespace('mcp-manager', { servers: { demo: entry } }, 11)]);
});

test('fallback selects a valid MCP server map when manager namespace is absent', () => {
  const result = readSettingsDocument(document([
    namespace('array-plugin', { servers: [] }, 1),
    namespace('arbitrary-plugin', { servers: { value: { unrelated: true } } }, 2),
    namespace('legacy-manager', { servers: { demo: entry } }, 3),
  ]));
  assert.equal(result.namespaces.length, 1);
  assert.equal(result.namespaces[0].ns, 'legacy-manager');
  assert.deepEqual(result.namespaces[0].value.servers.demo, entry);
});

test('invalid exact manager configuration is rejected instead of falling back', () => {
  assert.throws(
    () => readSettingsDocument(document([
      namespace('mcp-manager', { servers: { broken: { transport: 'not-a-transport' } } }, 1),
      namespace('valid-plugin', { servers: { demo: entry } }, 2),
    ])),
    /Invalid (server configuration|manager configuration)/,
  );
});

test('manager server and user maps retain their values and revision', () => {
  const user = { servers: { demo: { ...entry, enabled: false } } };
  const result = readSettingsDocument(document([
    namespace('mcp-manager', { servers: { demo: entry } }, 42, user),
  ]));
  assert.equal(result.writable, true);
  assert.equal(result.namespaces[0].revision, 42);
  assert.deepEqual(result.namespaces[0].value.servers, { demo: entry });
  assert.deepEqual(result.namespaces[0].user?.servers, user.servers);
});
