/**
 * The HTTP surface: one exact route answering the browser's catalogue request.
 *
 * The route owns nothing but transport concerns — the trust fence every shipped
 * browser route uses, method handling, and JSON framing. What the catalogue says
 * comes from the injected service, so this module stays replaceable if the page ever
 * moves to a different transport (an event stream, say).
 */
import type { McpCatalogService } from './service.ts';
import type { HostContext, HostRequest, HostResponse, WebRoute } from './types.ts';

/** Route path; deliberately outside `/api`, which the transport gateway owns. */
export const TOOLS_ROUTE = '/mcp-servers/tools';

/** Answer a request the trust fence refuses; true when it was rejected. */
function refused(ctx: HostContext, req: HostRequest, res: HostResponse): boolean {
  let rejection: number | undefined;
  try {
    rejection = ctx.connection.requestRejection(req);
  } catch {
    rejection = 403;
  }
  if (rejection === undefined) return false;
  res.statusCode = rejection;
  res.end();
  return true;
}

/** Send a JSON body with the headers every route of this bundle uses. */
function sendJson(res: HostResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/** The server name the request asks about, or `''`. */
function requestedServer(req: HostRequest): string {
  try {
    return new URL(String(req.url), 'http://localhost').searchParams.get('name') || '';
  } catch {
    return '';
  }
}

/** Build the route over an injected catalogue. */
export function createToolsRoute(ctx: HostContext, catalog: McpCatalogService): WebRoute {
  return {
    kind: 'exact',
    path: TOOLS_ROUTE,
    handler: function (req: HostRequest, res: HostResponse): void {
      if (refused(ctx, req, res)) return;
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('allow', 'GET');
        res.end();
        return;
      }
      try {
        sendJson(res, 200, { tools: catalog.tools(requestedServer(req)) });
      } catch (error) {
        sendJson(res, 200, { tools: [], error: String((error as Error | undefined)?.message ?? error) });
      }
    },
  };
}
