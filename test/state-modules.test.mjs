import './helpers/dom.mjs';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useCatalog } from '../src/client/hooks/catalog.ts';
import { useFleet } from '../src/client/hooks/fleet.ts';
import { useServerActions } from '../src/client/hooks/server-actions.ts';
import { useDraftEditor } from '../src/client/hooks/draft-editor.ts';
import { configuredRow, deferred, t } from './helpers/fixtures.mjs';

afterEach(cleanup);

test('catalogue caches accept every legal name, including Object prototype names', async () => {
  const names = ['constructor', '__proto__', 'toString'];
  const calls = [];
  const rows = names.map(name => configuredRow({ name }));
  const api = { async catalog(name) { calls.push(name); return [{ name: 'tool', description: name }]; } };
  const { result } = renderHook(() => useCatalog(api, rows));
  await waitFor(() => assert.equal(calls.length, 3));
  await waitFor(() => assert.equal(result.current.catalog.get('__proto__')?.loading, false));
  for (const name of names) assert.deepEqual(result.current.catalog.get(name).tools, [{ name: 'tool', description: name }]);
});

test('invalidating a catalogue aborts its old generation and ignores a late result', async () => {
  const old = deferred();
  const fresh = deferred();
  const calls = [];
  const api = { catalog(_name, signal) { calls.push(signal); return calls.length === 1 ? old.promise : fresh.promise; } };
  const rows = [configuredRow()];
  const { result, unmount } = renderHook(() => useCatalog(api, rows));
  await waitFor(() => assert.equal(calls.length, 1));
  act(() => result.current.dropCatalog(['github']));
  await waitFor(() => assert.equal(calls.length, 2));
  assert.equal(calls[0].aborted, true);
  await act(async () => old.resolve([{ name: 'stale', description: '' }]));
  assert.equal(result.current.catalog.get('github').loading, true);
  await act(async () => fresh.resolve([{ name: 'fresh', description: '' }]));
  assert.equal(result.current.catalog.get('github').tools[0].name, 'fresh');
  unmount();
});

test('StrictMode effect replay restarts an aborted catalogue read', async () => {
  const signals = [];
  const api = { async catalog(_name, signal) { signals.push(signal); return [{ name: 'ready', description: '' }]; } };
  const rows = [configuredRow()];
  const { result } = renderHook(() => useCatalog(api, rows), {
    reactStrictMode: true,
  });
  await waitFor(() => assert.equal(result.current.catalog.get('github')?.loading, false));
  assert.equal(result.current.catalog.get('github').tools[0].name, 'ready');
  assert.equal(signals[0].aborted, true);
  assert.ok(signals.length >= 2);
});

function mutableApi(initial) {
  let entries = structuredClone(initial);
  let revision = 1;
  const calls = [];
  const api = {
    async describe() { return { writable: true, namespaces: [{ ns: 'mcp-manager', revision,
      value: { servers: structuredClone(entries) }, user: { servers: structuredClone(entries) } }] }; },
    watch(listener) { listener([]); return () => {}; },
    async catalog() { return []; },
    async probe() { throw new Error('Unexpected probe'); },
    async restart() {},
    async mutate(ns, ops, expected) {
      assert.equal(ns, 'mcp-manager');
      assert.equal(expected, revision);
      calls.push(structuredClone(ops));
      for (const op of ops) {
        const name = op.path[1];
        if (op.op === 'unset') delete entries[name];
        else if (op.path.length === 3) entries[name][op.path[2]] = op.value;
        else entries = { ...entries, [name]: structuredClone(op.value) };
      }
      revision++;
    },
  };
  return { api, calls, entries: () => entries };
}
function usePageModules(api) {
  const fleet = useFleet(api);
  const catalogs = useCatalog(api, fleet.rows);
  const actions = useServerActions(api, t, fleet, catalogs);
  const editor = useDraftEditor(api, t, fleet, catalogs, actions);
  return { fleet, catalogs, actions, editor };
}

test('draft save preserves literal process data and reloads settings through public hooks', async () => {
  const entry = { transport: 'stdio', command: 'node', args: ['', ' padded ', 'x\ny'], env: { TOKEN: ' secret ' }, startupTimeoutMs: 1234 };
  const fixture = mutableApi({ github: entry });
  const { result } = renderHook(() => usePageModules(fixture.api));
  await waitFor(() => assert.equal(result.current.fleet.rows.length, 1));
  act(() => result.current.editor.openEdit(result.current.fleet.rows[0]));
  act(() => result.current.editor.setDraft({ ...result.current.editor.draft, name: 'renamed' }));
  await act(async () => result.current.editor.saveDraft());
  assert.equal(result.current.editor.draft, null);
  assert.deepEqual(fixture.entries().renamed.args, entry.args);
  assert.deepEqual(fixture.entries().renamed.env, entry.env);
  assert.equal(fixture.entries().renamed.startupTimeoutMs, 1234);
  assert.equal(Object.hasOwn(fixture.entries(), 'github'), false);
  assert.deepEqual(fixture.calls[0].map(op => [op.op, op.path]), [['set', ['servers', 'renamed']], ['unset', ['servers', 'github']]]);
});

test('JSON import skips existing names and commits only selected rows', async () => {
  const fixture = mutableApi({ github: { transport: 'stdio', command: 'old' } });
  const { result } = renderHook(() => usePageModules(fixture.api));
  await waitFor(() => assert.equal(result.current.fleet.rows.length, 1));
  act(() => result.current.editor.openAdd());
  act(() => result.current.editor.changeJsonText(JSON.stringify({ mcpServers: {
    github: { command: 'do-not-replace' }, first: { command: 'one' }, second: { command: 'two' },
  } })));
  assert.equal(result.current.editor.jsonState.rows[0].collision, true);
  act(() => result.current.editor.selectJsonRow('second', false));
  await act(async () => result.current.editor.importJson());
  assert.equal(fixture.entries().github.command, 'old');
  assert.equal(fixture.entries().first.command, 'one');
  assert.equal(Object.hasOwn(fixture.entries(), 'second'), false);
  assert.equal(result.current.editor.draft, null);
});

test('server delete disables before removal and uses the refreshed revision', async () => {
  const fixture = mutableApi({ github: { transport: 'stdio', command: 'node' } });
  const { result } = renderHook(() => usePageModules(fixture.api));
  await waitFor(() => assert.equal(result.current.fleet.rows.length, 1));
  act(() => result.current.actions.askDelete(['github']));
  await act(async () => { assert.deepEqual(await result.current.actions.performDelete(), ['github']); });
  assert.deepEqual(fixture.calls, [[{ op: 'set', path: ['servers', 'github', 'enabled'], value: false }], [{ op: 'unset', path: ['servers', 'github'] }]]);
  assert.deepEqual(fixture.entries(), {});
  assert.equal(result.current.actions.deleteIntent, null);
});
