// Real stream, module-interface and React DOM regressions. No profile writes.
import './helpers/dom.mjs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test, { afterEach } from 'node:test';
import { createElement as h } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createProbeRoute, PROBE_ROUTE } from '../src/host/probe.ts';
import { createApi } from '../src/client/api.ts';
import { Section } from '../src/client/section.ts';
import { deferred, pageApi, probeSuccess, subscribeLocale, t } from './helpers/fixtures.mjs';

afterEach(cleanup);

const draft = { transport: 'stdio', command: 'node', args: ['draft.js'], env: { TOKEN: '${credential:TEST}' }, cwd: 'D:/草稿', enabled: true };
const outcome = probeSuccess;
function fixture({ rejection, trustThrows = false, config, probe } = {}) {
  const calls = { config: [], probe: [], writes: 0, loads: 0 };
  const forbidden = () => { calls.writes++; throw new Error('Profile access is forbidden during a draft probe'); };
  const ctx = {
    connection: { requestRejection() { if (trustThrows) throw new Error('trust unavailable'); return rejection; } },
    settings: { mutate: forbidden, describe: forbidden },
    mcpManager: { probe: forbidden, register: forbidden, restart: forbidden },
  };
  const client = {
    Config(input) { calls.config.push(input); return config ? config(input) : { ...input, validated: true }; },
    async probeServer(context, value, options) {
      calls.probe.push({ context, value, options });
      return probe ? probe(context, value, options) : outcome;
    },
  };
  const route = createProbeRoute(ctx, async () => { calls.loads++; return client; });
  return { route, calls, ctx };
}
function request(method = 'POST') {
  const req = new PassThrough();
  req.method = method;
  req.url = PROBE_ROUTE;
  return req;
}
function response() {
  const res = new EventEmitter();
  res.headers = {};
  res.ended = false;
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.end = (body) => { res.ended = true; res.body = body; };
  return res;
}
async function invoke(f, body, method = 'POST') {
  const req = request(method);
  const res = response();
  const done = f.route.handler(req, res);
  for (const chunk of Array.isArray(body) ? body : [body]) {
    req.write(chunk);
    // Let the async iterator consume each chunk before writing the next one.
    await nextTurn();
  }
  req.end();
  await done;
  return { req, res };
}
const documentBody = (entry = draft) => JSON.stringify({ name: 'demo', entry });

for (const [name, options, status] of [
  ['untrusted request', { rejection: 401 }, 401],
  ['trust check exception', { trustThrows: true }, 403],
]) {
  test('host rejects ' + name + ' before loading a client', async () => {
    const f = fixture(options);
    const { res } = await invoke(f, documentBody());
    assert.equal(res.statusCode, status);
    assert.equal(res.ended, true);
    assert.equal(f.calls.loads, 0);
    assert.equal(f.calls.writes, 0);
  });
}

test('host only accepts POST on the exact draft route', async () => {
  const f = fixture();
  assert.equal(f.route.path, '/mcp-servers/probe');
  assert.equal(f.route.kind, 'exact');
  const { res } = await invoke(f, '', 'GET');
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.equal(f.calls.loads, 0);
});

test('host rejects invalid JSON and invalid document shapes without probing', async () => {
  const bodies = ['{bad', 'null', '[]', '{}', JSON.stringify({ name: 'bad name', entry: draft }),
    JSON.stringify({ name: 'x'.repeat(33), entry: draft }), JSON.stringify({ name: 'demo', entry: [] }),
    JSON.stringify({ name: 'demo', entry: 'node' })];
  for (const body of bodies) {
    const f = fixture();
    const { res } = await invoke(f, body);
    assert.equal(res.statusCode, 400, body);
    assert.equal(typeof JSON.parse(res.body).error, 'string');
    assert.equal(f.calls.probe.length, 0);
    assert.equal(f.calls.loads, 0);
  }
});

test('host validates the draft and does not disclose validation input', async () => {
  const secret = 'DO-NOT-RETURN-THIS-SECRET';
  const f = fixture({ config() { throw new Error(secret); } });
  const { res } = await invoke(f, documentBody({ ...draft, command: secret }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, 'Invalid MCP draft configuration');
  assert.equal(res.body.includes(secret), false);
  assert.equal(f.calls.probe.length, 0);
});

test('host passes the complete draft through Config to probeServer without profile access', async () => {
  const validated = { marker: 'Config return value' };
  const f = fixture({ config() { return validated; } });
  const entry = { ...draft, serverName: 'spoofed', expandTemplates: false, startupTimeoutMs: 1234 };
  const { req, res } = await invoke(f, documentBody(entry));
  assert.deepEqual(f.calls.config, [{ ...entry, serverName: 'demo', expandTemplates: true }]);
  assert.equal(f.calls.probe.length, 1);
  assert.equal(f.calls.probe[0].context, f.ctx);
  assert.equal(f.calls.probe[0].value, validated);
  assert.ok(f.calls.probe[0].options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(res.body), outcome);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(f.calls.writes, 0);
  assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(res.listenerCount('close'), 0);
});

test('host decodes multibyte UTF-8 split across real stream chunks', async () => {
  const body = Buffer.from(documentBody());
  const split = body.indexOf(Buffer.from('草')) + 1;
  const f = fixture();
  const { res } = await invoke(f, [body.subarray(0, split), body.subarray(split, split + 1), body.subarray(split + 1)]);
  assert.equal(res.statusCode, 200);
  assert.equal(f.calls.config[0].cwd, 'D:/草稿');
});

test('host enforces a 1 MiB byte limit, including multibyte bodies', async () => {
  const limit = 1024 * 1024;
  const prefix = JSON.stringify({ name: 'demo', entry: { ...draft, padding: '' } });
  const exact = prefix.replace('"padding":""', '"padding":"' + 'a'.repeat(limit - Buffer.byteLength(prefix)) + '"');
  assert.equal(Buffer.byteLength(exact), limit);
  const accepted = fixture();
  assert.equal((await invoke(accepted, exact)).res.statusCode, 200);
  for (const oversized of [exact + ' ', documentBody({ ...draft, padding: '中'.repeat(Math.ceil(limit / 3)) })]) {
    const rejected = fixture();
    const { res } = await invoke(rejected, oversized);
    assert.equal(res.statusCode, 413);
    assert.equal(rejected.calls.loads, 0);
    assert.equal(rejected.calls.probe.length, 0);
  }
});

for (const event of ['request-aborted', 'response-close']) {
  test('host aborts probe signal on ' + event + ' and removes listeners', async () => {
    const started = deferred();
    const finish = deferred();
    let signal;
    const f = fixture({ probe(_ctx, _config, options) { signal = options.signal; started.resolve(); return finish.promise; } });
    const req = request();
    const res = response();
    const done = f.route.handler(req, res);
    req.end(documentBody());
    await started.promise;
    assert.equal(signal.aborted, false);
    if (event === 'request-aborted') req.emit('aborted');
    else res.emit('close');
    assert.equal(signal.aborted, true);
    finish.resolve(outcome);
    await done;
    assert.equal(res.ended, false, 'no response should be written after disconnect');
    assert.equal(req.listenerCount('aborted'), 0);
    assert.equal(res.listenerCount('close'), 0);
    assert.equal(f.calls.writes, 0);
  });
}

test('host redacts unexpected probe errors and releases disconnect listeners', async () => {
  const f = fixture({ probe() { throw new Error('private credential'); } });
  const { req, res } = await invoke(f, documentBody());
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.parse(res.body).error, 'Draft probe could not be completed');
  assert.equal(res.body.includes('private credential'), false);
  assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(res.listenerCount('close'), 0);
});

async function mountPage(options) {
  const f = pageApi(options);
  const view = render(h(Section, { api: f.api, t, subscribeLocale }));
  await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Add', exact: true }).disabled, false));
  return { ...f, ...view, user: userEvent.setup() };
}

async function openForm(user) {
  await user.click(screen.getByRole('button', { name: 'Add', exact: true }));
  const dialog = await screen.findByRole('dialog', { name: 'Add an MCP server' });
  await user.click(within(dialog).getByRole('button', { name: 'Form', exact: true }));
  return within(dialog);
}

async function typeField(user, dialog, label, value) {
  const field = dialog.getByRole('textbox', { name: label, exact: true });
  await user.clear(field);
  if (value) await user.type(field, value);
}

for (const existing of [false, true]) {
  test('page tests the current ' + (existing ? 'edited' : 'new') + ' draft without temporary settings writes', async () => {
    const stored = { ...draft, command: 'OLD', env: { TOKEN: 'stored-token' }, startupTimeoutMs: 4321 };
    const snapshot = structuredClone(stored);
    const f = await mountPage({ configured: existing ? { demo: stored } : {} });
    let dialog;
    if (existing) {
      await f.user.click(await screen.findByRole('button', { name: 'Edit', exact: true }));
      dialog = within(await screen.findByRole('dialog', { name: 'Edit demo' }));
    } else {
      dialog = await openForm(f.user);
      await typeField(f.user, dialog, 'Name', 'demo');
    }
    await typeField(f.user, dialog, 'Command', 'NEW');
    await typeField(f.user, dialog, 'Arguments', 'draft.js');
    await typeField(f.user, dialog, 'Environment Variables', 'TOKEN=from-draft');
    await typeField(f.user, dialog, 'Working Directory', 'D:/草稿');
    const readsBeforeTest = f.calls.describe;
    await f.user.click(dialog.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => assert.equal(f.calls.probe.length, 1));
    assert.deepEqual(f.calls.probe[0].slice(0, 2), ['demo', {
      ...(existing ? { startupTimeoutMs: 4321 } : {}), ...draft, command: 'NEW', env: { TOKEN: 'from-draft' },
    }]);
    assert.ok(f.calls.probe[0][2] instanceof AbortSignal);
    assert.equal(f.calls.probe[0][2].aborted, false);
    await waitFor(() => assert.match(dialog.getByRole('status').textContent, /Connected — 2 tools in 42 ms/));
    assert.equal(f.calls.describe, readsBeforeTest, 'probing must not reread settings for temporary writes or rollback');
    assert.deepEqual(f.calls.mutate, []);
    assert.deepEqual(stored, snapshot, 'editing and testing must leave the saved entry unchanged');
  });
}

for (const rejected of [false, true]) {
  test('cancelling a probe prevents its late ' + (rejected ? 'failure' : 'success') + ' from changing a replacement dialog', async () => {
    const finish = deferred();
    const f = await mountPage({ probe: () => finish.promise });
    const first = await openForm(f.user);
    await typeField(f.user, first, 'Name', 'first');
    await typeField(f.user, first, 'Command', 'node');
    await f.user.click(first.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => assert.equal(f.calls.probe.length, 1));
    assert.match(first.getByRole('status').textContent, /Connecting/);
    await f.user.click(first.getByRole('button', { name: 'Cancel', exact: true }));
    assert.equal(f.calls.probe[0][2].aborted, true);
    assert.equal(screen.queryByRole('dialog'), null);
    const second = await openForm(f.user);
    await typeField(f.user, second, 'Name', 'second');
    await typeField(f.user, second, 'Command', 'other');
    await act(async () => {
      if (rejected) finish.reject(new Error('late failure'));
      else finish.resolve(outcome);
      await finish.promise.catch(() => {});
    });
    assert.equal(second.getByRole('textbox', { name: 'Name', exact: true }).value, 'second');
    assert.equal(second.getByRole('textbox', { name: 'Command', exact: true }).value, 'other');
    assert.equal(second.queryByRole('status'), null);
    assert.equal(second.queryByText(/late failure|Connected —/), null);
    assert.deepEqual(f.calls.mutate, []);
    assert.equal(f.calls.describe, 1);
  });
}

test('unmounting the real page aborts its probe and disposes subscriptions', async () => {
  const finish = deferred();
  const f = await mountPage({ probe: () => finish.promise });
  const dialog = await openForm(f.user);
  await typeField(f.user, dialog, 'Name', 'demo');
  await typeField(f.user, dialog, 'Command', 'node');
  await f.user.click(dialog.getByRole('button', { name: 'Test connection' }));
  await waitFor(() => assert.equal(f.calls.probe.length, 1));
  assert.equal(f.calls.probe[0][2].aborted, false);
  f.unmount();
  assert.equal(f.calls.probe[0][2].aborted, true);
  assert.equal(f.calls.disposed, 1);
  await act(async () => { finish.resolve(outcome); await finish.promise; });
  assert.equal(screen.queryByRole('dialog'), null);
  assert.deepEqual(f.calls.mutate, []);
});

test('client API posts the full draft body and caller signal without Remote settings access', async () => {
  const controller = new AbortController();
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => outcome };
  };
  const api = createApi({ get remote() { assert.fail('draft probe must not access Remote'); } }, fetcher);
  assert.deepEqual(await api.probe('demo', draft, controller.signal), outcome);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/mcp-servers/probe');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), { name: 'demo', entry: draft });
  assert.equal(requests[0].options.signal, controller.signal);
});

test('client API surfaces host refusals rather than treating them as probe success', async () => {
  const fetcher = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Invalid MCP draft configuration' }) });
  await assert.rejects(createApi({}, fetcher).probe('demo', draft, new AbortController().signal), /Invalid MCP draft configuration/);
});

test('client API rejects malformed probe responses at the public transport seam', async () => {
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, toolNames: ['x'] }) });
  await assert.rejects(createApi({}, fetcher).probe('demo', draft, new AbortController().signal), /Invalid probe response/);
});
