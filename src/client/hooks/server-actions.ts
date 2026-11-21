import { useCallback, useEffect, useRef, useState } from 'react';
import { codeOf, interpolate, messageOf, pickNamespace } from '../model.ts';
import type { DeleteIntent, Feedback, ManagerApi, Row, Translate } from '../types.ts';
import type { Fleet } from './fleet.ts';
import type { Catalog } from './catalog.ts';

/** Own row operations, pending state and notices; the page only reports user intent. */
export function useServerActions(api: ManagerApi, t: Translate, fleet: Fleet, catalogs: Catalog) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);
  const clearFeedback = useCallback((name: string) => {
    clearTimeout(timers.current.get(name));
    timers.current.delete(name);
    setFeedback(current => { const next = { ...current }; delete next[name]; return next; });
  }, []);
  const setCardFeedback = useCallback((name: string, tone: Feedback['tone'], text: string) => {
    if (!alive.current) return;
    clearTimeout(timers.current.get(name));
    timers.current.delete(name);
    setFeedback(current => {
      if (text) return { ...current, [name]: { tone, text } };
      const next = { ...current };
      delete next[name];
      return next;
    });
    if (text && tone === 'ok') timers.current.set(name, setTimeout(() => clearFeedback(name), 4000));
  }, [clearFeedback]);
  const markPending = useCallback((key: string, active: boolean) => {
    if (!alive.current) return;
    setPending(current => { const next = { ...current }; if (active) next[key] = true; else delete next[key]; return next; });
  }, []);
  const reportFailure = (name: string, error: unknown, fallbackKey?: string) => {
    if (codeOf(error) === 'settings-conflict') {
      setCardFeedback(name, 'error', t('conflict'));
      void fleet.loadDoc();
    } else {
      setCardFeedback(name, 'error', (fallbackKey ? interpolate(t(fallbackKey), { name }) + ' (' : '') + messageOf(error) + (fallbackKey ? ')' : ''));
    }
  };
  const run = async (key: string, name: string, task: () => Promise<void>) => {
    markPending(key, true);
    setCardFeedback(name, 'ok', '');
    try { await task(); } finally { markPending(key, false); }
  };
  const setEnabled = async (row: Row, enabled: boolean) => {
    if (!fleet.ns) return;
    const ns = fleet.ns;
    await run('switch:' + row.name, row.name, async () => {
      try {
        await api.mutate(ns, [{ op: 'set', path: ['servers', row.name, 'enabled'], value: enabled }], fleet.revision);
        catalogs.dropCatalog([row.name]);
        await fleet.loadDoc();
      } catch (error) { if (alive.current) reportFailure(row.name, error); }
    });
  };
  const restart = async (row: Row) => run('restart:' + row.name, row.name, async () => {
    try { await api.restart(row.name); catalogs.dropCatalog([row.name]); }
    catch (error) { if (alive.current) reportFailure(row.name, error, 'errorRestart'); }
  });
  const askDelete = (names: string[]) => {
    if (!names.length) return;
    setBulkError(null);
    setDeleteIntent({ names: names.slice(), busy: false });
  };
  const performDelete = async (): Promise<string[] | null> => {
    if (!deleteIntent || !fleet.ns) return null;
    const names = deleteIntent.names.slice();
    const ns = fleet.ns;
    setDeleteIntent({ names, busy: true });
    setBulkError(null);
    markPending('delete:bulk', true);
    try {
      let view = pickNamespace(await api.describe());
      await api.mutate(ns, names.map(name => ({ op: 'set', path: ['servers', name, 'enabled'], value: false })), view?.revision);
      view = pickNamespace(await api.describe());
      await api.mutate(ns, names.map(name => ({ op: 'unset', path: ['servers', name] })), view?.revision);
      catalogs.dropCatalog(names);
      await fleet.loadDoc();
      if (!alive.current) return null;
      setDeleteIntent(null);
      for (const name of names) setCardFeedback(name, 'ok', interpolate(t('noticeDeleted'), { name }));
      return names;
    } catch (error) {
      if (alive.current) {
        setDeleteIntent(null);
        setBulkError(codeOf(error) === 'settings-conflict' ? t('conflict') : t('errorDelete') + ' (' + messageOf(error) + ')');
        if (codeOf(error) === 'settings-conflict') void fleet.loadDoc();
      }
      return null;
    } finally { markPending('delete:bulk', false); }
  };
  return { isPending: (key: string) => pending[key] === true, markPending, feedback,
    setCardFeedback, clearFeedback, clearAllFeedback: () => setFeedback({}),
    deleteIntent, setDeleteIntent, bulkError, setBulkError, askDelete, performDelete, setEnabled, restart };
}
export type ServerActions = ReturnType<typeof useServerActions>;
