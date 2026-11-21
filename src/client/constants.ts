/** Locale namespace for the MCP servers page. */
export const NS = 'mcp.servers';

/** Settings section id and icon slot address. */
export const SECTION_ID = 'mcp-servers';

/** Profile entry id of the shipped manager. */
export const MANAGER_ENTRY = 'mcp-manager';

export const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const PROBE_CHIP_LIMIT = 40;
export const IMPORT_CONTAINERS: readonly string[] = ['mcpServers', 'mcp_servers', 'servers', 'mcp'];

/** Foreign keys consumed by the importer rather than preserved as native tuning. */
export const FOREIGN_KEYS: readonly string[] = [
  'transport',
  'type',
  'serverType',
  'command',
  'cmd',
  'args',
  'env',
  'cwd',
  'workingDirectory',
  'url',
  'endpoint',
  'serverUrl',
  'httpUrl',
  'headers',
  'environment',
  'enabled',
  'disabled',
  'name',
  'serverName',
  'id',
];
