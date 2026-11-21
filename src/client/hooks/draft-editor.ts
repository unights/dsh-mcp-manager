import { useEffect, useRef, useState } from 'react';
import { buildEntry, draftFromRow, emptyDraft, validateDraft } from '../draft.ts';
import { codeOf, interpolate, messageOf, parseImport, saveOps, validateServerName } from '../model.ts';
import type { Draft, JsonRow, JsonState, ManagerApi, MutationOp, ProbeResult, Row, Translate } from '../types.ts';
import type { Fleet } from './fleet.ts';
import type { Catalog } from './catalog.ts';
import type { ServerActions } from './server-actions.ts';

function emptyJson(): JsonState {
  return { text: '', placeholder: '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"]\n    }\n  }\n}',
    rows: [], skipped: [], error: null, message: null, parsing: false, importing: false };
}

/** Own a dialog lifetime so late operations cannot write into a replacement draft. */
export function useDraftEditor(api: ManagerApi, t: Translate, fleet: Fleet, catalogs: Catalog, actions: ServerActions) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [jsonState, setJsonState] = useState<JsonState | null>(null);
  const testAbort = useRef<AbortController | null>(null);
  const lifetime = useRef(0);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; lifetime.current++; testAbort.current?.abort(); };
  }, []);
  const reset = () => { lifetime.current++; testAbort.current?.abort(); testAbort.current = null; };
  const openAdd = () => { reset(); setDraft(emptyDraft()); setJsonState(emptyJson()); };
  const openEdit = (row: Row) => { reset(); setDraft(draftFromRow(row)); setJsonState(null); };
  const closeDraft = () => { reset(); setDraft(null); setJsonState(null); };
  const existingNames = fleet.rows.map(row => row.name);
  const validateName = (value: string, selfName?: string | null) => validateServerName(t, value, existingNames.filter(name => name !== selfName));
  const valid = (current: Draft) => {
    const problem = validateDraft(current, existingNames, t);
    if (!problem) return true;
    setDraft({ ...current, error: problem.message, errorField: problem.field });
    document.getElementById('mcps-f' + problem.field)?.focus();
    return false;
  };
  const saveDraft = async () => {
    if (!draft || !fleet.ns || !valid(draft)) return;
    const version = lifetime.current;
    const name = draft.name.trim();
    const next: Draft = { ...draft, saving: true, error: null, errorField: null, testResult: null, testError: null };
    setDraft(next);
    actions.markPending('save:' + name, true);
    try {
      await api.mutate(fleet.ns, saveOps(draft, buildEntry(draft)), fleet.revision);
      catalogs.dropCatalog(draft.originalName && draft.originalName !== name ? [name, draft.originalName] : [name]);
      await fleet.loadDoc();
      if (!alive.current || version !== lifetime.current) return;
      closeDraft();
      actions.setCardFeedback(name, 'ok', interpolate(t('noticeSaved'), { name }));
    } catch (error) {
      if (!alive.current || version !== lifetime.current) return;
      setDraft({ ...next, saving: false, error: codeOf(error) === 'settings-conflict' ? t('conflict') : interpolate(t('errorSave'), { name }) + ' (' + messageOf(error) + ')', errorField: null });
      if (codeOf(error) === 'settings-conflict') void fleet.loadDoc();
    } finally { actions.markPending('save:' + name, false); }
  };
  const testDraft = async () => {
    if (!draft || !valid(draft)) return;
    const version = lifetime.current;
    testAbort.current?.abort();
    const controller = new AbortController();
    testAbort.current = controller;
    setDraft({ ...draft, testing: true, testResult: null, testError: null, error: null, errorField: null });
    let result: ProbeResult | null = null;
    let failure: string | null = null;
    try { result = await api.probe(draft.name.trim(), buildEntry(draft), controller.signal); }
    catch (error) { failure = messageOf(error); }
    if (!alive.current || version !== lifetime.current || testAbort.current !== controller || controller.signal.aborted) return;
    testAbort.current = null;
    setDraft(current => current ? { ...current, testing: false, testResult: result, testError: failure } : current);
  };
  const changeJsonText = (text: string) => {
    setJsonState(current => {
      if (!current) return current;
      if (!text.trim()) return { ...current, text, error: null, message: null, rows: [], skipped: [] };
      const parsed = parseImport(text);
      if (parsed.error === 'json') return { ...current, text, rows: [], skipped: [], message: null, error: interpolate(t('jsonInvalid'), { error: parsed.message }) };
      const seen = new Set<string>();
      const rows: JsonRow[] = parsed.entries.map(item => {
        const collision = existingNames.includes(item.name) || seen.has(item.name);
        seen.add(item.name);
        return { ...item, collision, selected: !collision };
      });
      return { ...current, text, error: null, message: parsed.entries.length || parsed.skipped.length ? interpolate(t('jsonFound'), { count: parsed.entries.length }) : t('jsonNoServers'), rows, skipped: parsed.skipped };
    });
  };
  const selectJsonRow = (name: string, selected: boolean) => setJsonState(current => current ? { ...current,
    rows: current.rows.map(row => row.name === name ? { ...row, selected } : row) } : current);
  const importJson = async () => {
    if (!jsonState || !fleet.ns) return;
    const chosen = jsonState.rows.filter(row => row.selected && !row.collision);
    if (!chosen.length) { setJsonState({ ...jsonState, error: t('jsonNothingSelected') }); return; }
    const version = lifetime.current;
    setJsonState({ ...jsonState, importing: true, error: null });
    try {
      const ops: MutationOp[] = chosen.map(row => ({ op: 'set', path: ['servers', row.name], value: row.entry }));
      await api.mutate(fleet.ns, ops, fleet.revision);
      catalogs.dropCatalog(chosen.map(row => row.name));
      await fleet.loadDoc();
      if (!alive.current || version !== lifetime.current) return;
      for (const row of chosen) actions.setCardFeedback(row.name, 'ok', interpolate(t('noticeSaved'), { name: row.name }));
      closeDraft();
    } catch (error) {
      if (!alive.current || version !== lifetime.current) return;
      setJsonState({ ...jsonState, importing: false, error: codeOf(error) === 'settings-conflict' ? t('conflict') : t('errorImport') + ' (' + messageOf(error) + ')' });
      if (codeOf(error) === 'settings-conflict') void fleet.loadDoc();
    }
  };
  return { draft, setDraft, jsonState, openAdd, openEdit, closeDraft, saveDraft, testDraft,
    changeJsonText, selectJsonRow, importJson, validateName };
}
export type DraftEditor = ReturnType<typeof useDraftEditor>;
