/**
 * Host activation: expose the live catalogue and isolated draft-probe routes.
 * Normal catalogue reads use registered tools without opening connections.
 * Explicit draft tests use the shipped MCP client's bounded probe helper and
 * never mount a managed server, register tools or write profile settings.
 */
import { createCatalogService, type McpCatalogService } from './service.ts';
import { TOOLS_ROUTE, createToolsRoute } from './route.ts';
import { PROBE_ROUTE, createProbeRoute } from './probe.ts';
import type { Config, HostContext } from './types.ts';

export type { Config } from './types.ts';
export type { McpCatalogService } from './service.ts';

export const name: string = 'mcp-servers';

/** The services activation needs; `tools` is the catalogue's only source. */
export const inject: readonly string[] = ['webServer', 'connection', 'tools', 'mcpManager'];

/** Service id other plugins resolve with `ctx.get('mcpCatalog')`. */
export const SERVICE_NAME: string = 'mcpCatalog';

export function apply(ctx: HostContext, _config: Config = {}): void {
  const catalog: McpCatalogService = createCatalogService(function () {
    return ctx.tools;
  }, function () {
    return ctx.mcpManager.list().map(function (server) { return server.name; });
  });

  // Expose the catalogue as a Cordis service. `provide` and `set` are the two
  // spellings across Cordis versions; whichever exists owns the registration.
  const provide = ctx.provide ?? ctx.set;
  if (typeof provide === 'function') {
    provide.call(ctx, SERVICE_NAME, catalog);
  }

  ctx.effect(function () {
    return ctx.webServer.register(createToolsRoute(ctx, catalog));
  }, 'mcp-servers: tool catalogue route (' + TOOLS_ROUTE + ')');
  ctx.effect(function () {
    return ctx.webServer.register(createProbeRoute(ctx));
  }, 'mcp-servers: draft probe route (' + PROBE_ROUTE + ')');
}
