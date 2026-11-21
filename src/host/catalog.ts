/**
 * The tool catalogue: what the Host's tool runtime currently exposes for an MCP
 * server, read straight from the registered definitions.
 *
 * This is the discovery half of the Host: DSH's `dsh-mcp-client` owns the actual
 * connections and publishes one tool per MCP tool under the deterministic name
 * `mcp__<server>__<tool>`. This module only *reads* that namespace — it never opens
 * a transport, because a second client per server would register the same tools
 * twice.
 */
import type { HostTools } from './types.ts';

/** One tool, as the page's expanded row lists it. */
export interface ToolSummary {
  name: string;
  description: string;
}

/** Prefix every MCP tool name starts with. */
const TOOL_PREFIX = 'mcp__';

/**
 * Resolve only unambiguous namespaces from the live manager inventory.
 * A public name contains no owner metadata: `a` + `b__tool` and `a__b` +
 * `tool` have the same spelling, so neither first nor longest prefix is proof
 * of ownership. Keep separators inside raw tool names when only one owner fits.
 */
function matchingServers(toolName: string, serverNames: readonly string[]): string[] {
  if (typeof toolName !== 'string') return [];
  return [...new Set(serverNames)].filter(function (server) {
    return server !== '' && toolName.startsWith(TOOL_PREFIX + server + '__');
  });
}

/** The unique known owner, or null when absent or ambiguous. */
export function serverOfTool(toolName: string, serverNames: readonly string[]): string | null {
  const matches = matchingServers(toolName, serverNames);
  return matches.length === 1 ? matches[0] : null;
}

/** Read the definitions once; a throwing or absent runtime reads as no tools. */
function readDefinitions(tools: HostTools | undefined): Array<Record<string, unknown>> {
  if (!tools || typeof tools.definitions !== 'function') return [];
  let definitions: unknown;
  try {
    definitions = tools.definitions();
  } catch {
    return [];
  }
  if (!Array.isArray(definitions)) return [];
  return definitions as Array<Record<string, unknown>>;
}

/** Every server that currently owns at least one registered tool, sorted. */
export function serversIn(tools: HostTools | undefined, serverNames: readonly string[]): string[] {
  const names = new Set<string>();
  for (const definition of readDefinitions(tools)) {
    const server = serverOfTool(String(definition.name), serverNames);
    if (server !== null) names.add(server);
  }
  return [...names].sort();
}

/**
 * The uniquely attributed tools of one server. Refuse the entire catalogue when
 * any candidate's owner is ambiguous, rather than reporting a partial success.
 */
export function toolsFor(tools: HostTools | undefined, serverName: string, serverNames: readonly string[]): ToolSummary[] {
  if (serverName === '' || !serverNames.includes(serverName)) return [];
  const prefix = TOOL_PREFIX + serverName + '__';
  const found: ToolSummary[] = [];
  for (const definition of readDefinitions(tools)) {
    const toolName = definition.name;
    if (typeof toolName !== 'string' || !toolName.startsWith(prefix)) continue;
    const matches = matchingServers(toolName, serverNames);
    if (matches.length > 1) {
      throw new Error('MCP tool namespace ambiguity: "' + toolName + '" matches servers ' + matches.map(function (name) { return '"' + name + '"'; }).join(', ') + '; the tool runtime exposes no server ownership metadata.');
    }
    found.push({
      name: toolName.slice(prefix.length),
      description: typeof definition.description === 'string' ? definition.description : '',
    });
  }
  found.sort((left, right) => left.name.localeCompare(right.name));
  return found;
}
