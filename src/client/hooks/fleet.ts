import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { messageOf, own, pickNamespace } from '../model.ts';
import type { ManagedServer, ManagerApi, Row, ServerEntry, SettingsDocument } from '../types.ts';

/** Subscribe to fleet status and read settings; expose the page's single row projection. */
export function useFleet(api: ManagerApi) {
  const [servers, setServers] = useState<ManagedServer[] | null>(null);
  const [doc, setDoc] = useState<SettingsDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const generation = useRef(0);
  const readVersion = useRef(0);
  const loadDoc = useCallback(async () => {
    const version = ++readVersion.current;
    const lifetime = generation.current;
    try {
      const next = await api.describe();
      if (lifetime !== generation.current || version !== readVersion.current) return;
      setDoc(next);
      setLoadError(null);
    } catch (error) {
      if (lifetime === generation.current && version === readVersion.current) setLoadError(messageOf(error));
    }
  }, [api]);
  useEffect(() => {
    const lifetime = ++generation.current;
    const dispose = api.watch(list => {
      if (generation.current !== lifetime) return;
      setServers(list);
      setWatchError(null);
    }, error => {
      if (generation.current === lifetime) setWatchError(messageOf(error));
    });
    void loadDoc();
    return () => { generation.current++; dispose(); };
  }, [api, loadDoc]);

  const nsView = pickNamespace(doc);
  const configured: Record<string, ServerEntry> = nsView?.value.servers ?? {};
  const userServers = nsView?.user?.servers ?? {};
  const rows = useMemo(() => {
    const result: Row[] = Object.keys(configured).map(name => {
      const entry = configured[name];
      const runtime = servers?.find(candidate => candidate.name === name);
      return {
        name, source: 'configured', entry,
        status: runtime?.status ?? { state: entry.enabled === false ? 'disabled' : 'starting' },
        present: runtime?.configured !== false,
        removable: own(userServers, name), inherited: !own(userServers, name),
      };
    });
    for (const runtime of servers ?? []) {
      if (own(configured, runtime.name)) continue;
      result.push({ name: runtime.name, source: 'registered', entry: null, status: runtime.status,
        present: runtime.configured !== false, removable: false, inherited: false });
    }
    return result.sort((left, right) => left.name.localeCompare(right.name));
  }, [configured, userServers, servers]);

  return { servers, doc, nsView, ns: nsView?.ns ?? null, revision: nsView?.revision,
    configured, rows, writable: Boolean(doc?.writable && nsView), loadError, watchError, loadDoc };
}

export type Fleet = ReturnType<typeof useFleet>;
