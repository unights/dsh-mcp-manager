import { FOREIGN_KEYS, IMPORT_CONTAINERS, MANAGER_ENTRY, NAME_PATTERN } from './constants.ts';
import type {
  Draft,
  ExportFormat,
  ImportedEntry,
  MutationOp,
  NameResult,
  NamespaceView,
  NormalizeResult,
  PairParseResult,
  PairProblem,
  ParseImportResult,
  ReconnectConfig,
  RowStatus,
  ServerEntry,
  SettingsDocument,
  SkippedEntry,
  StatusView,
  Tone,
  Translate,
  Transport,
} from './types.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isReconnectConfig(value: unknown): value is ReconnectConfig {
  if (!isRecord(value)) return false;
  return (value.enabled === undefined || typeof value.enabled === 'boolean') &&
    ['initialDelayMs', 'maxDelayMs', 'maxAttempts'].every((key) =>
      value[key] === undefined || (typeof value[key] === 'number' && Number.isFinite(value[key])));
}

/** Validate only known fields; unrelated tuning remains opaque JSON data. */
export function isServerEntry(value: unknown): value is ServerEntry {
  if (!isRecord(value)) return false;
  if (value.transport !== undefined && value.transport !== 'stdio' && value.transport !== 'streamable-http') return false;
  if (!['command', 'cwd', 'url'].every((key) => value[key] === undefined || typeof value[key] === 'string')) return false;
  if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every((arg: unknown) => typeof arg === 'string'))) return false;
  if (value.env !== undefined && !isStringRecord(value.env)) return false;
  if (value.headers !== undefined && !isStringRecord(value.headers)) return false;
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return false;
  if (value.reconnect !== undefined && !isReconnectConfig(value.reconnect)) return false;
  return ['startupTimeoutMs', 'toolCallTimeoutMs', 'closeTimeoutMs'].every((key) =>
    value[key] === undefined || (typeof value[key] === 'number' && Number.isFinite(value[key])));
}

export function messageOf(error: unknown): string {
  if (error === null || error === undefined) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (!isRecord(error)) return String(error);
  const code = codeOf(error);
  const nested = isRecord(error.error) ? error.error : undefined;
  const text = typeof error.message === 'string' && error.message !== ''
    ? error.message
    : nested && typeof nested.message === 'string' ? nested.message : String(error);
  return code ? code + ': ' + text : text;
}

/** Remote success/failure envelopes are distinct from a probe's own `ok` flag. */
export function unwrap(result: unknown): unknown {
  if (!isRecord(result) || typeof result.ok !== 'boolean' || (!own(result, 'value') && !own(result, 'error'))) return result;
  if (!result.ok) {
    const detail = isRecord(result.error) ? result.error : {};
    const error = new Error(typeof detail.message === 'string' ? detail.message : 'Remote call failed');
    if (typeof detail.code === 'string') Object.assign(error, { code: detail.code });
    throw error;
  }
  return result.value;
}

export function codeOf(error: unknown): string {
  return isRecord(error) && typeof error.code === 'string' ? error.code : '';
}

export function interpolate(text: string, values?: Record<string, unknown> | null): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match: string, key: string) =>
    values[key] === undefined ? match : String(values[key]));
}

export function splitLines(text: string): string[] {
  return String(text || '').split('\n');
}

export function parseList(text: string): string[] {
  return splitLines(text).map((line) => line.trim()).filter((line) => line.length > 0);
}

/** Parse line-based pairs and report the first malformed or duplicate entry. */
export function parsePairs(text: string, separator: string): PairParseResult {
  const pairs: Record<string, string> = {};
  let found = false;
  let problem: PairProblem | null = null;
  const lines = splitLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = separator === '=' ? lines[index].replace(/\r$/, '') : lines[index].trim();
    if (line.trim().length === 0) continue;
    const cut = line.indexOf(separator);
    if (cut <= 0) {
      problem = { kind: 'format', line: index + 1 };
      break;
    }
    const key = line.slice(0, cut).trim();
    // Environment values are literal process data; header padding is optional whitespace.
    const value = separator === '=' ? line.slice(cut + separator.length) : line.slice(cut + separator.length).trim();
    if (!key) {
      problem = { kind: 'format', line: index + 1 };
      break;
    }
    if (own(pairs, key)) {
      problem = { kind: 'duplicate', key };
      break;
    }
    pairs[key] = value;
    found = true;
  }
  return { pairs: found ? pairs : undefined, problem };
}

export function pairsToText(pairs: Record<string, string> | null | undefined, separator: string): string {
  if (!pairs) return '';
  return Object.keys(pairs).map((key) => key + separator + pairs[key]).join('\n');
}

export function transportOf(entry: ServerEntry | null | undefined): Transport {
  return entry?.transport === 'streamable-http' ? 'streamable-http' : 'stdio';
}

export function pickNamespace(doc: SettingsDocument | null | undefined): NamespaceView | null {
  if (!doc) return null;
  return doc.namespaces.find((candidate) => candidate.ns === MANAGER_ENTRY) ?? doc.namespaces[0] ?? null;
}

export function own(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function normalizeName(raw: unknown): NameResult {
  const source = String(raw ?? '').trim();
  const replaced = source.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  const name = replaced.length > 0 ? replaced : 'server';
  return { name, changed: name !== source };
}

/** Normalize the established foreign field names; native documents keep tuning. */
export function normalizeImportedEntry(raw: unknown, options?: { preserve?: boolean }): NormalizeResult {
  if (!isRecord(raw)) return { error: 'entry' };
  const declared = String(raw.transport || raw.type || raw.serverType || '').toLowerCase();
  let transport: Transport;
  let warning: string | null = null;
  if (declared === 'stdio' || declared === 'local') transport = 'stdio';
  else if (declared === 'sse') {
    transport = 'streamable-http';
    warning = 'sse';
  } else if (declared === '') {
    transport = raw.url || raw.endpoint || raw.serverUrl || raw.httpUrl ? 'streamable-http' : 'stdio';
  } else transport = 'streamable-http';
  const entry: ServerEntry = { transport };
  if (transport === 'streamable-http') {
    const url = raw.url || raw.endpoint || raw.serverUrl || raw.httpUrl;
    if (typeof url !== 'string' || url.trim() === '') return { error: 'entry' };
    entry.url = url.trim();
    if (raw.headers !== undefined && raw.headers !== null) {
      if (!isStringRecord(raw.headers)) return { error: 'entry' };
      if (Object.keys(raw.headers).length > 0) entry.headers = raw.headers;
    }
  } else {
    const source = raw.command !== undefined ? raw.command : raw.cmd;
    let args: unknown = raw.args;
    let command: unknown = source;
    if (Array.isArray(source)) {
      command = source[0];
      args = source.slice(1);
    }
    if (typeof command !== 'string' || command.trim() === '') return { error: 'entry' };
    entry.command = command.trim();
    if (Array.isArray(args)) entry.args = args.map(String);
    else if (typeof args === 'string' && args.trim() !== '') entry.args = parseList(args);
    const env = raw.env !== undefined ? raw.env : raw.environment;
    if (env !== undefined && env !== null) {
      if (!isStringRecord(env)) return { error: 'entry' };
      entry.env = env;
    }
    const cwd = raw.cwd || raw.workingDirectory;
    if (typeof cwd === 'string' && cwd.trim() !== '') entry.cwd = cwd.trim();
  }
  entry.enabled = raw.enabled !== false && raw.disabled !== true;
  if (options?.preserve) {
    for (const key of Object.keys(raw)) {
      if (!FOREIGN_KEYS.includes(key)) entry[key] = raw[key];
    }
  }
  return isServerEntry(entry) ? { entry, warning } : { error: 'entry' };
}

export function parseImport(text: string): ParseImportResult {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return { error: 'json', message: messageOf(error) };
  }
  let map: Record<string, unknown> | null = null;
  let container: string | undefined;
  if (Array.isArray(document)) {
    map = Object.fromEntries(document.flatMap((item: unknown, index) =>
      isRecord(item) ? [[String(item.name || item.serverName || item.id || 'server-' + String(index + 1)), item]] : []));
  } else if (isRecord(document)) {
    container = IMPORT_CONTAINERS.find((key) => isRecord(document[key]));
    const selectedContainer = container ? document[container] : undefined;
    if (isRecord(selectedContainer)) map = selectedContainer;
    else if (Array.isArray(document.servers)) {
      map = Object.fromEntries(document.servers.flatMap((item: unknown, index) =>
        isRecord(item) ? [[String(item.name || 'server-' + String(index + 1)), item]] : []));
    } else map = document;
  }
  if (!map) return { entries: [], skipped: [] };
  const entries: ImportedEntry[] = [];
  const skipped: SkippedEntry[] = [];
  for (const rawName of Object.keys(map)) {
    const normalized = normalizeName(rawName);
    const rawEntry = map[rawName];
    const preserve = container === 'servers' || (isRecord(rawEntry) && own(rawEntry, 'transport'));
    const result = normalizeImportedEntry(rawEntry, { preserve });
    if (result.error) {
      skipped.push({ name: rawName, reason: 'entry' });
    } else {
      entries.push({ name: normalized.name, originalName: rawName, changed: normalized.changed, entry: result.entry, warning: result.warning });
    }
  }
  return { entries, skipped };
}

export const EXPORT_CONTAINERS: Record<ExportFormat, string> = {
  mcp_servers_camel: 'mcpServers',
  servers_typed: 'servers',
  mcp_servers_snake: 'mcp_servers',
  mcp_compact: 'mcp',
};

export function filled(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

export function exportShape(entry: ServerEntry, format: ExportFormat): Record<string, unknown> {
  const remote = transportOf(entry) === 'streamable-http';
  const args = entry.args ?? [];
  if (format === 'mcp_compact') {
    if (remote) {
      const shaped: Record<string, unknown> = { type: 'remote', url: entry.url };
      if (filled(entry.headers)) shaped.headers = entry.headers;
      return shaped;
    }
    const shaped: Record<string, unknown> = { type: 'local', command: [entry.command, ...args] };
    if (filled(entry.env)) shaped.environment = entry.env;
    if (entry.cwd) shaped.cwd = entry.cwd;
    return shaped;
  }
  if (remote) {
    const shaped: Record<string, unknown> = format === 'mcp_servers_snake'
      ? { transport: 'streamable_http', url: entry.url }
      : { type: 'http', url: entry.url };
    if (filled(entry.headers)) shaped.headers = entry.headers;
    return shaped;
  }
  const shaped: Record<string, unknown> = { command: entry.command, args };
  if (format === 'servers_typed') shaped.type = 'stdio';
  if (format === 'mcp_servers_snake') shaped.transport = 'stdio';
  if (filled(entry.env)) shaped.env = entry.env;
  if (entry.cwd) shaped.cwd = entry.cwd;
  return shaped;
}

export function buildExport(entries: Array<{ name: string; entry: ServerEntry | null }>, format: ExportFormat): string {
  const container = EXPORT_CONTAINERS[format] || EXPORT_CONTAINERS.mcp_servers_camel;
  const output = Object.fromEntries(entries.map((item) => [item.name, exportShape(item.entry ?? {}, format)]));
  return JSON.stringify({ [container]: output }, null, 2);
}

const STATE_KEYS: Record<string, string> = {
  connected: 'stateConnected', connecting: 'stateConnecting', reconnecting: 'stateReconnecting',
  'waiting-credentials': 'stateWaitingCredentials', failed: 'stateFailed', closed: 'stateClosed',
  disabled: 'stateDisabled', starting: 'stateStarting',
};

export const TONE_TOKEN: Record<Tone, string> = {
  ok: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  idle: 'var(--dsw-alias-state-idle-primary)',
};

export function renderStatus(t: Translate, status: RowStatus | null | undefined): StatusView {
  const state = status?.state ?? '';
  const key = STATE_KEYS[state];
  const label = key ? t(key) : t('statusUnknown');
  const diagnostics: string[] = [];
  const add = (value: unknown): void => {
    if (typeof value === 'string' && value !== '') diagnostics.push(value);
  };
  if (state === 'connected') return { tone: 'ok', label, tooltip: '' };
  if (state === 'connecting') return { tone: 'warn', label, tooltip: '' };
  if (state === 'reconnecting' || state === 'waiting-credentials') {
    add(status?.lastError);
    return { tone: 'warn', label, tooltip: diagnostics.join(' · ') };
  }
  if (state === 'failed') {
    add(status?.lastError);
    add(status?.result?.cleanupError);
    return { tone: 'error', label, tooltip: diagnostics.join(' · '), blocked: status?.reason === 'unclosed-generation' };
  }
  if (state === 'closed') {
    add(status?.result?.cleanupError);
    return { tone: 'idle', label, tooltip: diagnostics.join(' · '), blocked: status?.result?.closeConfirmed === false };
  }
  return { tone: 'idle', label, tooltip: '' };
}

export function saveOps(draft: Draft, entry: ServerEntry): MutationOp[] {
  const name = draft.name.trim();
  const ops: MutationOp[] = [{ op: 'set', path: ['servers', name], value: entry }];
  if (draft.originalName && draft.originalName !== name) ops.push({ op: 'unset', path: ['servers', draft.originalName] });
  return ops;
}

export function validateServerName(t: Translate, value: unknown, existingNames: string[]): string | null {
  const name = String(value ?? '').trim();
  if (!NAME_PATTERN.test(name)) return t('invalidName');
  return existingNames.includes(name) ? t('nameTaken') : null;
}

export function testStatusOf(t: Translate, current: Draft | null | undefined): { tone: Tone; text: string } | null {
  if (!current) return null;
  if (current.error && !current.errorField) return { tone: 'error', text: current.error };
  if (current.testing) return { tone: 'idle', text: t('testConnecting') };
  if (current.testError) return { tone: 'error', text: interpolate(t('testFailed'), { error: current.testError }) };
  const result = current.testResult;
  if (!result) return null;
  if (result.ok) {
    const count = result.toolNames.length;
    const toolsText = count === 1 ? t('toolsOne') : interpolate(t('tools'), { count });
    return { tone: 'ok', text: interpolate(t('testSucceeded'), { tools: toolsText, ms: result.durationMs }) };
  }
  return { tone: 'error', text: interpolate(t('testFailed'), { error: result.message || result.stage }) };
}
