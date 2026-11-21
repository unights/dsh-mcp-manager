import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as React from 'react';

/** Exercise the exact shipped loader envelope, without rewriting its implementation. */
export function loadClient() {
  const source = readFileSync(new URL('../../dist/client.js', import.meta.url), 'utf8');
  let registration;
  vm.runInNewContext(source, { fetch, AbortController, setTimeout, clearTimeout, window: { __ModuleLoader__: { load(value) { registration = value; } } } });
  if (registration?.id !== 'dsh-mcp-servers') throw new Error('Missing DSH client loader registration');
  const dependencies = new Set();
  const plugin = registration.factory(name => {
    dependencies.add(name);
    if (name === 'react') return React;
    throw new Error('Unexpected runtime dependency: ' + name);
  });
  const dictionaries = {};
  const slots = new Map();
  const ctx = {
    effect: fn => fn(),
    locale: {
      register(namespace, values) { dictionaries[namespace] = values; return () => {}; },
      bind: namespace => key => dictionaries[namespace]?.en?.[key] ?? key,
      subscribe: () => () => {},
    },
    remote: {},
    slots: { inject: (_name, fn) => fn(), register: (options, Component) => { slots.set(options.name, Component); } },
  };
  return { plugin, ctx, dependencies, dictionaries, slots, source };
}
