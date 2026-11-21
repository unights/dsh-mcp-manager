import { en } from '../../src/client/locale/en.ts';

export const t = (key) => {
  if (!(key in en)) throw new Error('Missing English translation: ' + key);
  return en[key];
};
export const noop = () => {};
export const subscribeLocale = () => noop;
export const probeSuccess = {
  ok: true, toolNames: ['search', 'fetch'], truncated: false, durationMs: 42, closeConfirmed: true,
};
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
export function configuredRow(overrides = {}) {
  return {
    name: 'github', source: 'configured',
    entry: { transport: 'stdio', command: 'node', args: ['server.js'], enabled: true },
    status: { state: 'connected', toolCount: 2 },
    present: true, removable: true, inherited: false,
    ...overrides,
  };
}

// The external API is the replacement seam. State, effects, memoization and
// cancellation inside the page are all owned by React and the real modules.
export function pageApi({ configured = {}, probe, catalog, describe } = {}) {
  const calls = { describe: 0, watch: 0, disposed: 0, probe: [], catalog: [], mutate: [], restart: [] };
  const document = {
    writable: true,
    namespaces: [{ ns: 'mcp-manager', revision: 7, value: { servers: configured }, user: { servers: configured } }],
  };
  const statuses = Object.entries(configured).map(([name, entry]) => ({
    name, configured: true, status: { state: entry.enabled === false ? 'disabled' : 'connected', toolCount: 0 },
  }));
  let onList;
  let onError;
  const api = {
    async describe() { calls.describe++; return describe ? describe() : document; },
    watch(listener, errorListener) {
      calls.watch++;
      onList = listener;
      onError = errorListener;
      listener(statuses);
      return () => { calls.disposed++; };
    },
    async catalog(name, signal) {
      calls.catalog.push([name, signal]);
      return catalog ? catalog(name, signal) : [];
    },
    async probe(...args) { calls.probe.push(args); return probe ? probe(...args) : probeSuccess; },
    async mutate(...args) { calls.mutate.push(args); throw new Error('Unexpected profile mutation'); },
    async restart(...args) { calls.restart.push(args); },
  };
  return { api, calls, document, emit: (list) => onList(list), failWatch: (error) => onError(error) };
}
