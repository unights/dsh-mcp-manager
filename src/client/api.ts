import { MANAGER_ENTRY } from './constants.ts';
import { isRecord, isServerEntry, messageOf, unwrap } from './model.ts';
import type {
  ClientContext,
  CloseResult,
  ManagedServer,
  ManagerApi,
  NamespaceView,
  ProbeResult,
  RowStatus,
  ServerEntry,
  SettingsDocument,
  ToolSummary,
} from './types.ts';

function invalidResponse(kind: string): never {
  throw new Error('Invalid ' + kind + ' response');
}

function readServerMap(value: unknown): Record<string, ServerEntry> {
  if (!isRecord(value)) return invalidResponse('server configuration');
  const entries: Array<[string, ServerEntry]> = [];
  for (const [name, entry] of Object.entries(value)) {
    if (!isServerEntry(entry)) return invalidResponse('server configuration');
    entries.push([name, entry]);
  }
  return Object.fromEntries(entries);
}

function readManagerServerMap(value: unknown, strict: boolean): Record<string, ServerEntry> | null {
  const map = readServerMap(value);
  const entries = Object.values(map);
  const managerShape = entries.length > 0 && entries.every((entry) =>
    entry.transport === 'stdio' || entry.transport === 'streamable-http');
  if (!managerShape && !(strict && entries.length === 0)) {
    if (strict) return invalidResponse('manager configuration');
    return null;
  }
  return map;
}

function readNamespace(candidate: Record<string, unknown>, strict: boolean): NamespaceView | null {
  try {
    if (typeof candidate.ns !== 'string' || !isRecord(candidate.value) || !isRecord(candidate.value.servers)) {
      if (strict) return invalidResponse('manager configuration');
      return null;
    }
    if (typeof candidate.revision !== 'number' || !Number.isFinite(candidate.revision)) {
      if (strict) return invalidResponse('settings revision');
      return null;
    }
    const servers = readManagerServerMap(candidate.value.servers, strict);
    if (!servers) return null;
    const view: NamespaceView = {
      ns: candidate.ns,
      value: { servers },
      revision: candidate.revision,
    };
    if (candidate.user !== undefined && candidate.user !== null) {
      if (!isRecord(candidate.user) ||
          (candidate.user.servers !== undefined && !isRecord(candidate.user.servers))) {
        if (strict) return invalidResponse('user configuration');
        return null;
      }
      view.user = { servers: readServerMap(candidate.user.servers ?? {}) };
    }
    return view;
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

/** Project only the manager namespace from the generic Settings document. */
export function readSettingsDocument(value: unknown): SettingsDocument {
  if (!isRecord(value) || typeof value.writable !== 'boolean' || !Array.isArray(value.namespaces)) return invalidResponse('settings');
  const candidates: Record<string, unknown>[] = [];
  for (const candidate of value.namespaces) {
    if (!isRecord(candidate) || typeof candidate.ns !== 'string') return invalidResponse('settings namespace');
    candidates.push(candidate);
  }
  const exact = candidates.find((candidate) => candidate.ns === MANAGER_ENTRY);
  if (exact) {
    const view = readNamespace(exact, true);
    if (!view) return invalidResponse('manager configuration');
    return { writable: value.writable, namespaces: [view] };
  }
  // Older Settings documents may omit the manager namespace. Choose the first
  // namespace whose servers map is a valid MCP configuration; unrelated plugin
  // values such as `servers: []` or arbitrary server maps are ignored.
  for (const candidate of candidates) {
    const view = readNamespace(candidate, false);
    if (view) return { writable: value.writable, namespaces: [view] };
  }
  return { writable: value.writable, namespaces: [] };
}

function readCloseResult(value: unknown): CloseResult {
  if (!isRecord(value) || typeof value.closeConfirmed !== 'boolean' ||
      (value.cleanupError !== undefined && typeof value.cleanupError !== 'string')) return invalidResponse('cleanup');
  return {
    closeConfirmed: value.closeConfirmed,
    ...(typeof value.cleanupError === 'string' ? { cleanupError: value.cleanupError } : {}),
  };
}

function readStatus(value: unknown): RowStatus {
  if (!isRecord(value) || typeof value.state !== 'string') return invalidResponse('server status');
  const status: RowStatus = { state: value.state };
  for (const key of ['reason', 'lastError'] as const) {
    const item = value[key];
    if (item !== undefined) {
      if (typeof item !== 'string') return invalidResponse('server status');
      status[key] = item;
    }
  }
  for (const key of ['toolCount', 'attempt', 'maxAttempts', 'nextRetryAtMs', 'retryAt', 'connectedAt'] as const) {
    const item = value[key];
    if (item !== undefined) {
      if (typeof item !== 'number' || !Number.isFinite(item)) return invalidResponse('server status');
      status[key] = item;
    }
  }
  if (value.result !== undefined) status.result = readCloseResult(value.result);
  return status;
}

export function readManagedServers(value: unknown): ManagedServer[] {
  if (!Array.isArray(value)) return invalidResponse('server list');
  return value.map((item: unknown) => {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.configured !== 'boolean') return invalidResponse('server list');
    return { name: item.name, configured: item.configured, status: readStatus(item.status) };
  });
}

export function readProbeResult(value: unknown): ProbeResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.durationMs !== 'number' ||
      !Number.isFinite(value.durationMs)) return invalidResponse('probe');
  const closure = readCloseResult(value);
  if (!value.ok) {
    if ((value.stage !== 'connect' && value.stage !== 'list') || typeof value.message !== 'string') return invalidResponse('probe');
    return { ...closure, ok: false, stage: value.stage, message: value.message, durationMs: value.durationMs };
  }
  if (!Array.isArray(value.toolNames) || !value.toolNames.every((name: unknown) => typeof name === 'string') ||
      typeof value.truncated !== 'boolean') return invalidResponse('probe');
  let serverInfo: { name: string; version: string } | undefined;
  if (value.serverInfo !== undefined) {
    if (!isRecord(value.serverInfo) || typeof value.serverInfo.name !== 'string' || typeof value.serverInfo.version !== 'string') return invalidResponse('probe');
    serverInfo = { name: value.serverInfo.name, version: value.serverInfo.version };
  }
  return {
    ...closure, ok: true, toolNames: value.toolNames, truncated: value.truncated,
    durationMs: value.durationMs, ...(serverInfo ? { serverInfo } : {}),
  };
}

export function readToolSummaryList(value: unknown): ToolSummary[] {
  if (!Array.isArray(value)) return invalidResponse('tool catalogue');
  return value.map((tool: unknown) => {
    if (!isRecord(tool) || typeof tool.name !== 'string') return invalidResponse('tool catalogue');
    return { name: tool.name, description: typeof tool.description === 'string' ? tool.description : '' };
  });
}

async function responsePayload(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('HTTP ' + String(response.status) + ': invalid JSON response');
  }
  if (!response.ok || (isRecord(payload) && payload.error)) {
    throw new Error(isRecord(payload) && payload.error ? messageOf(payload.error) : 'HTTP ' + String(response.status));
  }
  return payload;
}

/** Validate wire data at the transport seam; page modules only consume local types. */
export function createApi(ctx: ClientContext, fetcher: typeof fetch = fetch): ManagerApi {
  function manager() {
    if (!ctx.remote.mcpManager) throw new Error('ctx.remote.mcpManager is unavailable');
    return ctx.remote.mcpManager;
  }
  function settings() {
    if (!ctx.remote.settings) throw new Error('ctx.remote.settings is unavailable');
    return ctx.remote.settings;
  }
  return {
    watch(onList, onError) {
      const controller = new AbortController();
      let closed = false;
      void (async () => {
        try {
          for await (const list of manager().watch(controller.signal)) {
            if (closed) return;
            onList(readManagedServers(list));
          }
        } catch (error) {
          if (!closed && !controller.signal.aborted) onError(error);
        }
      })();
      return () => { closed = true; controller.abort(); };
    },
    async describe() {
      return readSettingsDocument(unwrap(await settings().describe()));
    },
    async mutate(ns, ops, revision) {
      unwrap(await settings().mutate(ns, ops, revision));
    },
    async restart(name) {
      unwrap(await manager().restart(name));
    },
    async probe(name, entry, signal) {
      const response = await fetcher('/mcp-servers/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ name, entry }),
        signal,
      });
      return readProbeResult(await responsePayload(response));
    },
    async catalog(name, signal) {
      const response = await fetcher('/mcp-servers/tools?name=' + encodeURIComponent(name), {
        headers: { accept: 'application/json' }, signal,
      });
      const payload = await responsePayload(response);
      if (!isRecord(payload)) return invalidResponse('tool catalogue');
      return readToolSummaryList(payload.tools);
    },
  };
}
