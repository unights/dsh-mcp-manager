import type { HostContext, HostRequest, HostResponse, WebRoute } from './types.ts';

export const PROBE_ROUTE = '/mcp-servers/probe';

/** The shipped MCP client supplies validation, template redaction and bounded cleanup. */
export interface DraftProbeClient {
  Config: (input: unknown) => Record<string, unknown>;
  probeServer: (ctx: HostContext, config: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<unknown>;
}

async function loadProbeClient(): Promise<DraftProbeClient> {
  const packageName = '@deepseek-ai/dsh-mcp-client';
  return import(packageName);
}

/** A draft probe never writes settings or mounts a managed instance. */
export function createProbeRoute(
  ctx: HostContext,
  loadClient: () => Promise<DraftProbeClient> = loadProbeClient,
): WebRoute {
  return {
    kind: 'exact',
    path: PROBE_ROUTE,
    handler: async function (req: HostRequest, res: HostResponse): Promise<void> {
      let rejection: number | undefined;
      try { rejection = ctx.connection.requestRejection(req); } catch { rejection = 403; }
      if (rejection !== undefined) {
        res.statusCode = rejection;
        res.end();
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('allow', 'POST');
        res.end();
        return;
      }
      const controller = new AbortController();
      const abort = function () { controller.abort(); };
      req.on('aborted', abort);
      res.on('close', abort);
      let status = 200;
      let body: unknown;
      try {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          const buffer = Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > 1024 * 1024) {
            status = 413;
            throw new Error('Draft exceeds 1 MiB');
          }
          chunks.push(buffer);
        }
        let payload;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          status = 400;
          throw new Error('Invalid JSON draft');
        }
        if (!payload || typeof payload !== 'object' || typeof payload.name !== 'string' ||
            !/^[A-Za-z0-9_-]{1,32}$/.test(payload.name) || !payload.entry ||
            typeof payload.entry !== 'object' || Array.isArray(payload.entry)) {
          status = 400;
          throw new Error('Expected a server name and draft entry');
        }
        const client = await loadClient();
        let config: Record<string, unknown>;
        try {
          config = client.Config({ ...payload.entry, serverName: payload.name, expandTemplates: true });
        } catch {
          status = 400;
          throw new Error('Invalid MCP draft configuration');
        }
        body = await client.probeServer(ctx, config, { signal: controller.signal });
      } catch (error) {
        if (status === 200) status = error instanceof SyntaxError ? 400 : 500;
        // Do not include validation input: drafts may contain credentials.
        body = { error: status === 500 ? 'Draft probe could not be completed' : String((error as Error).message) };
      } finally {
        req.off('aborted', abort);
        res.off('close', abort);
      }
      if (controller.signal.aborted) return;
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
    },
  };
}
