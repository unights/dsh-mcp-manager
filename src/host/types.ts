/**
 * The shapes the Host half works with.
 *
 * Everything here is structural: the peer packages (`@deepseek-ai/cordis`,
 * `@deepseek-ai/schemastery`) are Host-provided and not resolvable from this
 * package, so the plugin declares the slices of them it uses instead of importing
 * types it cannot resolve.
 */

/** Plugin configuration. Empty on purpose: see `Config` in index.ts. */
export interface Config {
  readonly version?: number;
}

/** The request fields this plugin reads. */
export interface HostRequest extends AsyncIterable<Uint8Array> {
  method?: string;
  url?: string;
  on: (event: string, listener: () => void) => unknown;
  off: (event: string, listener: () => void) => unknown;
}

/** The response methods this plugin uses. */
export interface HostResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
  on: (event: string, listener: () => void) => unknown;
  off: (event: string, listener: () => void) => unknown;
}

/** One named route, in the shape `webServer.register` accepts. */
export interface WebRoute {
  kind: 'exact' | 'prefix';
  path: string;
  handler: (req: HostRequest, res: HostResponse) => void | Promise<void>;
}

/** The slice of the tool runtime this plugin reads. */
export interface HostTools {
  definitions: () => unknown;
}

/** The slice of the Host context this plugin uses. */
export interface HostContext {
  effect: (fn: () => void | (() => void), label?: string) => void;
  webServer: { register: (route: WebRoute) => () => void };
  connection: { requestRejection: (req: HostRequest) => number | undefined };
  tools: HostTools;
  mcpManager: { list: () => Array<{ name: string }> };
  /** Cordis service registration; both spellings exist across versions. */
  provide?: (name: string, value: unknown) => void;
  set?: (name: string, value: unknown) => void;
  logger?: { error: (error: unknown) => void };
}
