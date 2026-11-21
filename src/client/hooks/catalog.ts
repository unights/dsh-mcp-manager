import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from '../model.ts';
import type { ManagerApi, Panel, Row } from '../types.ts';

/** Cache catalogue reads and cancel obsolete generations without reconnecting servers. */
export function useCatalog(api: ManagerApi, rows: Row[]) {
  const [catalog, setCatalog] = useState(new Map<string, Panel>());
  const requests = useRef(new Map<string, AbortController>());
  const cache = useRef(new Map<string, Panel>());
  const currentRows = useRef(rows);
  currentRows.current = rows;
  const alive = useRef(false);

  const loadTools = useCallback(async (name: string, options?: { silent?: boolean }) => {
    if (!alive.current || requests.current.has(name)) return;
    const controller = new AbortController();
    requests.current.set(name, controller);
    const connected = currentRows.current.find(row => row.name === name)?.status.state === 'connected';
    const update = (panel: Panel) => {
      cache.current.set(name, panel);
      setCatalog(new Map(cache.current));
    };
    if (!options?.silent) update({ loading: true, tools: cache.current.get(name)?.tools ?? [], unavailable: false, connected });
    try {
      const tools = await api.catalog(name, controller.signal);
      if (!alive.current || controller.signal.aborted || requests.current.get(name) !== controller) return;
      update({ loading: false, tools, unavailable: false, connected });
    } catch (error) {
      if (!alive.current || controller.signal.aborted || requests.current.get(name) !== controller) return;
      update({ loading: false, tools: cache.current.get(name)?.tools ?? [], unavailable: true, connected, error: messageOf(error) });
    } finally {
      if (requests.current.get(name) === controller) requests.current.delete(name);
    }
  }, [api]);

  useEffect(() => {
    alive.current = true;
    cache.current.clear();
    setCatalog(new Map());
    return () => {
      alive.current = false;
      for (const controller of requests.current.values()) controller.abort();
      requests.current.clear();
      cache.current.clear();
    };
  }, [api]);

  const namesKey = rows.map(row => row.name).join('|');
  useEffect(() => {
    const names = new Set(namesKey === '' ? [] : namesKey.split('|'));
    for (const [name, controller] of requests.current) {
      if (!names.has(name)) { controller.abort(); requests.current.delete(name); }
    }
    for (const name of cache.current.keys()) if (!names.has(name)) cache.current.delete(name);
    for (const name of names) {
      if (!cache.current.has(name)) void loadTools(name);
    }
  }, [namesKey, loadTools, catalog]);

  const dropCatalog = useCallback((names: string[]) => {
    for (const name of names) {
      requests.current.get(name)?.abort();
      requests.current.delete(name);
      cache.current.delete(name);
    }
    setCatalog(new Map(cache.current));
  }, []);
  return { catalog, loadTools, dropCatalog };
}

export type Catalog = ReturnType<typeof useCatalog>;
