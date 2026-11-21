import { interpolate, pairsToText, parseList, parsePairs, transportOf, validateServerName } from './model.ts';
import type { Draft, DraftProblem, Row, ServerEntry, Translate } from './types.ts';

export function emptyDraft(): Draft {
  return {
    mode: 'add', tab: 'json', name: '', transport: 'stdio', command: '', args: '', env: '',
    cwd: '', url: '', headers: '', enabled: true, original: null, originalName: null,
    canRename: false, error: null, errorField: null, saving: false, testing: false,
    testResult: null, testError: null,
  };
}

export function draftFromRow(row: Row): Draft {
  const entry = row.entry ?? {};
  return {
    ...emptyDraft(),
    mode: 'edit',
    tab: 'form',
    name: row.name,
    transport: transportOf(entry),
    command: entry.command ?? '',
    args: entry.args?.join('\n') ?? '',
    env: pairsToText(entry.env, '='),
    cwd: entry.cwd ?? '',
    url: entry.url ?? '',
    headers: pairsToText(entry.headers, ': '),
    enabled: entry.enabled !== false,
    original: entry,
    originalName: row.name,
    canRename: !row.inherited,
  };
}

/** Rebuild owned fields while preserving opaque tuning and untouched literal values. */
export function buildEntry(current: Draft): ServerEntry {
  const entry: ServerEntry = { ...current.original };
  for (const field of ['transport', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'enabled']) delete entry[field];
  entry.transport = current.transport;
  if (current.transport === 'streamable-http') {
    entry.url = current.url.trim();
    const headers = parsePairs(current.headers, ':');
    if (headers.pairs) entry.headers = headers.pairs;
  } else {
    entry.command = current.command.trim();
    const originalArgs = current.original?.args;
    const args = originalArgs && current.args === originalArgs.join('\n') ? originalArgs.slice() : parseList(current.args);
    if (args.length > 0) entry.args = args;
    const originalEnv = current.original?.env;
    if (originalEnv && current.env === pairsToText(originalEnv, '=')) entry.env = { ...originalEnv };
    else {
      const env = parsePairs(current.env, '=');
      if (env.pairs) entry.env = env.pairs;
    }
    const cwd = current.cwd.trim();
    if (cwd) entry.cwd = cwd;
  }
  entry.enabled = current.enabled;
  return entry;
}

export function validateDraft(current: Draft, existingNames: string[], t: Translate): DraftProblem | null {
  const nameError = validateServerName(t, current.name, existingNames.filter((name) => name !== current.originalName));
  if (nameError) return { field: 'name', message: nameError };
  if (current.transport === 'streamable-http') {
    if (!current.url.trim()) return { field: 'url', message: t('requiredUrl') };
    const problem = parsePairs(current.headers, ':').problem;
    if (problem) return {
      field: 'headers',
      message: problem.kind === 'format'
        ? interpolate(t('badHeaderLine'), { line: problem.line })
        : interpolate(t('duplicateKey'), { key: problem.key }),
    };
  } else {
    if (!current.command.trim()) return { field: 'command', message: t('requiredCommand') };
    const originalEnv = current.original?.env;
    // The editor is line based; unchanged original values may themselves contain newlines.
    const problem = originalEnv && current.env === pairsToText(originalEnv, '=')
      ? null : parsePairs(current.env, '=').problem;
    if (problem) return {
      field: 'env',
      message: problem.kind === 'format'
        ? interpolate(t('badEnvLine'), { line: problem.line })
        : interpolate(t('duplicateKey'), { key: problem.key }),
    };
  }
  return null;
}
