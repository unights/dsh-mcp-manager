import type {
  ComponentType,
  CSSProperties,
  MouseEventHandler,
  ReactElement,
  ReactNode,
} from 'react';

export type Dictionary = Record<string, string>;
export type Translate = (key: string) => string;
export type VNode = ReactElement | null;
export type Transport = 'stdio' | 'streamable-http';
export type ExportFormat = 'mcp_servers_camel' | 'servers_typed' | 'mcp_servers_snake' | 'mcp_compact';
export type Tone = 'ok' | 'warn' | 'error' | 'idle';
export type ThemeStyle = CSSProperties & Record<`--${string}`, string | number>;

export interface ReconnectConfig {
  enabled?: boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
}

/** Known transport fields remain typed; future tuning is carried through unchanged. */
export interface ServerEntry {
  [key: string]: unknown;
  transport?: Transport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  reconnect?: ReconnectConfig;
  startupTimeoutMs?: number;
  toolCallTimeoutMs?: number;
  closeTimeoutMs?: number;
}

export interface CloseResult {
  closeConfirmed: boolean;
  cleanupError?: string;
}

export type ProbeResult = CloseResult & (
  | {
      ok: true;
      serverInfo?: { name: string; version: string };
      toolNames: string[];
      truncated: boolean;
      durationMs: number;
    }
  | { ok: false; stage: 'connect' | 'list'; message: string; durationMs: number }
);

export interface RowStatus {
  state?: string;
  reason?: string;
  toolCount?: number;
  lastError?: string;
  attempt?: number;
  maxAttempts?: number;
  nextRetryAtMs?: number;
  retryAt?: number;
  connectedAt?: number;
  result?: CloseResult;
}

export interface ManagedServer {
  name: string;
  configured: boolean;
  status: RowStatus;
}

/** The installed Settings service uses monotonic numeric revisions. */
export type SettingsRevision = number;
export interface ServerSettings {
  servers: Record<string, ServerEntry>;
}
export interface NamespaceView {
  ns: string;
  value: ServerSettings;
  user?: ServerSettings;
  revision: SettingsRevision;
}
export interface SettingsDocument {
  writable: boolean;
  namespaces: NamespaceView[];
}

export interface Row {
  name: string;
  source: 'configured' | 'registered';
  entry: ServerEntry | null;
  status: RowStatus;
  present: boolean;
  removable: boolean;
  inherited: boolean;
}

export type PairProblem = { kind: 'format'; line: number } | { kind: 'duplicate'; key: string };
export interface PairParseResult {
  pairs: Record<string, string> | undefined;
  problem: PairProblem | null;
}
export interface NameResult {
  name: string;
  changed: boolean;
}
export interface ImportedEntry {
  name: string;
  originalName: string;
  changed: boolean;
  entry: ServerEntry;
  warning: string | null;
}
export interface SkippedEntry {
  name: string;
  reason: string;
}
export type ParseImportResult =
  | { entries: ImportedEntry[]; skipped: SkippedEntry[]; error?: undefined }
  | { error: 'json'; message: string; entries?: undefined; skipped?: undefined };
export type NormalizeResult =
  | { entry: ServerEntry; warning: string | null; error?: undefined }
  | { error: 'entry'; entry?: undefined; warning?: undefined };
export interface StatusView {
  tone: Tone;
  label: string;
  tooltip?: string;
  blocked?: boolean;
}
export interface ToolSummary {
  name: string;
  description: string;
}
export interface Panel {
  loading: boolean;
  tools: ToolSummary[];
  unavailable: boolean;
  connected: boolean;
  error?: string;
}
export type DraftField = 'name' | 'command' | 'url' | 'env' | 'headers' | 'args' | 'cwd';
export interface DraftProblem {
  field: DraftField;
  message: string;
}
export interface Draft {
  mode: 'add' | 'edit';
  tab: 'form' | 'json';
  name: string;
  transport: Transport;
  command: string;
  args: string;
  env: string;
  cwd: string;
  url: string;
  headers: string;
  enabled: boolean;
  original: ServerEntry | null;
  originalName: string | null;
  canRename: boolean;
  error: string | null;
  errorField: DraftField | null;
  saving: boolean;
  testing: boolean;
  testResult: ProbeResult | null;
  testError: string | null;
}
export interface JsonRow extends ImportedEntry {
  collision: boolean;
  selected: boolean;
}
export interface JsonState {
  text: string;
  placeholder: string;
  rows: JsonRow[];
  skipped: SkippedEntry[];
  error: string | null;
  message: string | null;
  parsing: boolean;
  importing: boolean;
}
export interface ExportState {
  format: ExportFormat;
  entries: Array<{ name: string; entry: ServerEntry | null }>;
  text: string;
  copied: boolean;
}
export type MutationOp =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'unset'; path: string[] };
export interface Feedback {
  tone: 'ok' | 'error';
  text: string;
}
export interface DeleteIntent {
  names: string[];
  busy: boolean;
}

/** Local operations consumed by the page, independent of the Remote wire contract. */
export interface ManagerApi {
  describe: () => Promise<SettingsDocument>;
  watch: (onList: (snapshot: ManagedServer[]) => void, onError: (error: unknown) => void) => () => void;
  mutate: (ns: string, ops: MutationOp[], revision?: SettingsRevision) => Promise<void>;
  restart: (name: string) => Promise<void>;
  probe: (name: string, entry: ServerEntry, signal: AbortSignal) => Promise<ProbeResult>;
  catalog: (name: string, signal?: AbortSignal) => Promise<ToolSummary[]>;
}
export interface ManagerRemote {
  watch: (signal?: AbortSignal) => AsyncIterable<ManagedServer[]>;
  restart: (name: string) => Promise<unknown>;
}
export interface SettingsRemote {
  describe: () => Promise<unknown>;
  mutate: (ns: string, ops: MutationOp[], revision?: SettingsRevision) => Promise<unknown>;
}
export interface ClientContext {
  effect: (fn: () => void | (() => void), label?: string) => void;
  get: (name: string) => unknown;
  slots: {
    inject: (key: string, fn: () => void | (() => void)) => void;
    register: (options: Record<string, unknown>, component: ComponentType) => void | (() => void);
  };
  locale: {
    register: (ns: string, dictionaries: Record<string, Dictionary>) => () => void;
    bind: (ns: string) => Translate;
    subscribe: (listener: () => void) => () => void;
  };
  remote: { mcpManager?: ManagerRemote; settings?: SettingsRemote };
  logger?: { error: (error: unknown) => void };
}
export interface WithTranslate {
  t: Translate;
}
export interface ModalProps extends WithTranslate {
  title: string;
  titleId: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  dialogClassName?: string;
}
export interface ModeSwitchProps extends WithTranslate {
  tab: Draft['tab'];
  busy: boolean;
  onSelect: (tab: Draft['tab']) => void;
}
export interface FormTabProps extends WithTranslate {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onValidateName: (value: string, selfName?: string | null) => string | null;
}
export interface JsonTabProps extends WithTranslate {
  json: JsonState;
  onText: (text: string) => void;
  onSelect: (name: string, selected: boolean) => void;
}
export interface ExportDialogProps extends WithTranslate {
  exportState: ExportState;
  onClose: () => void;
  onFormat: (format: ExportFormat) => void;
  onCopy: () => void;
  onDownload: () => void;
}
export interface ConfirmDeleteDialogProps extends WithTranslate {
  names: string[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}
export interface ServerCardProps extends WithTranslate {
  row: Row;
  writable: boolean;
  isPending: (key: string) => boolean;
  selectionMode: boolean;
  selected: boolean;
  onSelect: (name: string, selected: boolean) => void;
  feedback: Feedback | null;
  expanded: boolean;
  panel: Panel | null;
  onToggleExpand: (name: string) => void;
  onExport: (name: string) => void;
  onRestart: (row: Row) => void;
  onSetEnabled: (row: Row, enabled: boolean) => void;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
  onDismissFeedback: (name: string) => void;
}
export interface ExpandedBodyProps extends WithTranslate {
  panel: Panel | null;
}
export interface IconButtonOptions {
  key?: string;
  icon: ComponentType<{ size?: number }>;
  label: string;
  title?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  danger?: boolean;
}
export interface SectionProps extends WithTranslate {
  api: ManagerApi;
  subscribeLocale: (listener: () => void) => () => void;
  styleText?: string;
}
