/**
 * The Host-side service other plugins can consume.
 *
 * Registered on activation as `mcpCatalog` (see index.ts), so a sibling plugin can
 * read the same catalogue without going through HTTP:
 *
 * ```ts
 * const catalog = ctx.get('mcpCatalog') as McpCatalogService | undefined
 * catalog?.servers()          // ['github', 'playwright']
 * catalog?.tools('github')    // [{ name: 'search', description: '…' }]
 * ```
 *
 * It is a read-only projection of the tool runtime: no connection is opened here, and
 * nothing is cached between calls, so the answer always matches what the runtime
 * currently exposes.
 */
import { serversIn, toolsFor, type ToolSummary } from './catalog.ts';
import type { HostTools } from './types.ts';

/** What consumers receive from `ctx.get('mcpCatalog')`. */
export interface McpCatalogService {
  /** Servers that currently own at least one registered tool. */
  servers: () => string[];
  /** The tools of one server, without the `mcp__<server>__` prefix. */
  tools: (serverName: string) => ToolSummary[];
}

/** Bind the service to a live tool runtime. */
export function createCatalogService(tools: () => HostTools | undefined, serverNames: () => readonly string[]): McpCatalogService {
  return {
    servers: function (): string[] {
      return serversIn(tools(), serverNames());
    },
    tools: function (serverName: string): ToolSummary[] {
      return toolsFor(tools(), serverName, serverNames());
    },
  };
}
