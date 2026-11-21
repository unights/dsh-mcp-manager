# dsh-mcp-servers

An MCP server management page in DeepSeek Harness **Settings**.

The page adds one section to the settings sidebar, **MCP servers**, that lists
every server the shipped `@deepseek-ai/dsh-mcp-manager` runs for this Host —
servers saved in the profile and servers a plugin registers — with live status,
restart, expandable tool details, import/export, and editing of configured entries.

## Where it appears

Settings → **MCP servers** (sidebar foot). The same page is reachable from the
Plugins inventory as this bundle's row.

The page ships a dictionary for every language Harness offers — 中文, English,
日本語, Español, Français, Deutsch, Русский, Português — and follows
**Settings → General → Language** immediately, with no reload: every label is
resolved from the active locale at render time, and a locale without a key falls
back to English.

## Server rows

One tall, vertically centred line per server:

```
[▸]  [G]  github  stdio                    [✎] [↻] [⭱] [🗑]  (●━)
          ● Connected · 12 tools
```

- **Leading cell** — a 40 px strip spanning the row's full height, so the whole
  left edge is clickable and shows a pointer cursor: the expand control (a chevron
  that rotates when open), or, in selection mode, the checkbox. Selection mode
  replaces the expand control rather than adding a column, so the row keeps one
  shape.
- **Monogram** — the server name's first character in a 34 px rounded square whose
  hue is derived from the name, so each server keeps a distinguishable colour.
- **Two-line summary** — line 1 is the name plus its transport (`stdio` / `HTTP`),
  or a `Plugin` badge for plugin-registered servers and `Inherited` for entries
  from a lower configuration layer; line 2 is the connection state with a
  tone-coloured dot followed by the live tool count. Hovering line 2 shows the
  **raw diagnostic** the supervisor or client reported — no added explanations.
- **Icon actions** — 32 px edit, restart, export and delete buttons whose
  accessible name is also their tooltip. Restart is disabled with a reason in its
  tooltip when the entry is disabled or its previous connection never closed.
  **The actions are mutually exclusive**: while a restart, switch or bulk delete is
  running on a row, or while that row is still connecting or starting, its other
  action buttons are disabled until it settles. Restart comes back after a failed
  connection — that is what resets the reconnect budget — and stays disabled only
  when the previous connection never closed.
- **Switch** — a far-right toggle that enables or disables the server without
  opening the editor (`role="switch"`, `aria-checked`). Turning it off unmounts the
  instance and keeps the entry. Enabling, disabling and restarting post no notice;
  only failures do.

### What expanding shows

Expanding **never reconnects** and never shows a loading step after the first
load: every catalogue is prefetched once the server list arrives and cached per
server, so opening a row renders from cache while a silent refresh runs behind it.
The expanded area is bounded to 340 px and scrolls inside itself, so a long
catalogue never moves the page.

- **Registered tools** → a two-column list: name and its own description. No wrapper
  box, no header row and no summary line: the row above already carries the count.
- **Nothing registered, server connected** → `No tools are registered.`
- **Nothing registered, server not connected** → `Not connected`.
- **Catalogue unreachable** → the reason and the HTTP status.

A tool exists only while an instance has a synced generation, so a disabled,
failed or never-connected server has nothing to read. The expansion offers no
connection test: the row's own status already answers that, and a test would
reconnect — which is exactly what this page avoids.

Tool descriptions are not part of the manager's Remote probe result, so the bundle
has a Host half: `GET /mcp-servers/tools?name=<server>` returns the registered
tools behind the same connection trust check every shipped browser route uses. If
that route is unreachable the list says descriptions are unavailable and still
offers the explicit test.

## Toolbar

The only buttons above the list are, left to right:

- **多选 / Select** — toggles selection mode; it renders pressed (inverse fill)
  while the mode is on, so the state is visible without counting checkboxes.
- **刷新 / Refresh** — re-reads the configuration. The label never changes while it
  runs (it dims and pulses instead), so the toolbar never reflows.
- **＋添加 / ＋Add** — opens the dialog; its fill is the inverse of the current
  light/dark surface (`label-primary` on `bg-base`).

## Selection mode

While selection mode is on, each configured row shows a checkbox instead of its
chevron, and the bar offers **All**, **Invert**, **Export** and **Delete** — no
separate clear button, since All + Invert reach the same place. Export covers the
selected servers; Delete opens a second-confirmation dialog that lists the names,
and deletion **stops the connection first** — the entries are disabled, the
manager disposes the instances, and only then are the entries removed.

Per-row export still exists for a single server, and the toolbar keeps no bulk
export of its own.

## The add / edit dialog

Adding and editing happen in a modal dialog (`role="dialog"`, Escape or the × in the
header closes it, Tab is trapped inside it, focus returns to the trigger), not in
the page body. Every dialog ends with its actions at the bottom right, **Cancel
first and the completion action last** — inverse-filled for Save, Import and Copy,
red for Delete. Each input keeps a **reserved message row**: it shows the formatting
rule by default, and a validation refusal replaces that same text in place, so an
error never moves the fields below it. While adding, the **name is checked as it is
typed** — format and collisions — and again on blur, which is also the first point
an empty name is reported. Leading and trailing spaces are **removed when the
field loses focus**, so the field and the stored key can never disagree about
padding. A refusal that belongs to the form rather than a field (a save conflict)
uses the footer's status slot instead.

**Adding** places a two-segment switch in the dialog header, to the left of the
close button: **Form** or **JSON**, with JSON selected first. The switch is a
pressed-state toggle group, and it is disabled while a save or import runs.

- **Form** — name, then a **transport tab** — `STDIO (local process)` or
  `Streamable HTTP (remote service)` — which swaps the fields below it: command,
  arguments, environment variables and working directory for STDIO, or URL and
  headers for Streamable HTTP. A **new server is always created enabled** and the
  dialog has no enabled control at all: the **switch on its row** is the only place
  to enable or disable a server, and an edit keeps whatever state the entry already
  has. Unchanged argument and environment fields retain their original values,
  including empty arguments, surrounding spaces and embedded newlines. Changed
  argument text still uses the one-argument-per-line editor rules.
  While editing, the **name stays editable**: a rename is written as one
  mutation that sets the new key and removes the previous one, and the collision
  check ignores the entry being renamed. Entries inherited from a lower
  configuration layer keep their name, because removing them at this layer would
  only restore the base entry under the old key. Every row below the tabs
  has the same shape — **label → control → one helper line** — so the spacing is
  identical everywhere; the helper is a single line with an ellipsis and its full
  text on hover. Literals inside a helper — a `KEY=VALUE` pattern, a
  `Name: Value` pattern, `${credential:NAME}` — render as **inline code**, and
  every helper ends with a terminal mark so the rows read consistently.
- **JSON** — paste a document from another MCP client and import several servers
  at once; the document is parsed as it is typed or pasted, with no Parse step.
  Recognized shapes:

  | Shape | Example |
  |---|---|
  | `mcpServers` | Claude Desktop, Claude Code, Cursor, Windsurf |
  | `mcp_servers` | snake_case collections |
  | `servers` | DeepSeek Harness itself — keeps `startupTimeoutMs`, `reconnect`, … |
  | `mcp` | generic bundles |
  | bare map | any object whose keys are server names |
  | array | `[{ "name": "...", "command": "..." }]` |

  Entry fields are read from either naming convention (`command`/`cmd`,
  `args`, `env`, `cwd`/`workingDirectory`, `url`/`endpoint`/`serverUrl`,
  `headers`), and the transport from `transport`, `type` or `serverType`. A URL
  without a declared transport is treated as `streamable-http`; `sse` is imported
  as `streamable-http` and flagged, because Harness has no SSE transport. Names
  are rewritten to the accepted `[A-Za-z0-9_-]{1,32}` form, existing names are
  marked and left unselected, and every parsed server is chosen individually
  before import.

### Testing before you commit

**Test connection** probes the server as it is currently drafted, and answers on a
single line beside its own button — `Connecting…`, then either
`Connected — 12 tools in 840 ms` or the failure text — so no result panel opens
inside the form.

- Both new and existing servers are probed using the current draft, including
  unsaved command, argument, URL and credential changes.
- The Host uses the shipped MCP client's isolated `probeServer` helper. Testing
  never writes profile settings, mounts a managed instance, or registers tools.
  Cancelling the test aborts the isolated connection and runs bounded cleanup.
  **Save** is still what keeps the server.

## Exporting

The export dialog offers four portable conventions, with **Copy** and
**Download**. Each option is labelled by its top-level key alone. Each carries only
the fields its transport uses — a stdio entry never has `url`/`headers`, an HTTP
entry never has process fields, and tuning such as `startupTimeoutMs` or
`reconnect` is never emitted.

| Convention | Top key | stdio | remote |
|---|---|---|---|
| `mcp_servers_camel` (default) | `mcpServers` | `command`, `args`, `env`; **no** `type` | `type: "http"`, `url`, `headers` |
| `servers_typed` | `servers` | `type: "stdio"`, `command`, `args`, `env` | `type: "http"`, `url`, `headers` |
| `mcp_servers_snake` | `mcp_servers` | `transport: "stdio"`, `command`, `args`, `env` | `transport: "streamable_http"`, `url`, `headers` |
| `mcp_compact` | `mcp` | `type: "local"`, `command: [cmd, ...args]`, `environment` | `type: "remote"`, `url`, `headers` |

Empty `env`/`headers` objects are omitted rather than emitted as `{}`. All four
STDIO conventions retain a non-empty `cwd`, so relative paths keep their working
directory when re-imported. `sse` never
appears as an output value because Harness has no SSE transport: a streamable HTTP
server is written as `http` (or `streamable_http` in the snake convention). None of
these portable shapes can express `enabled: false`.

Importing reads all four back, including the compact `command` array and
`environment` key, so an export from this page can be re-imported unchanged.

## Notices

Action failures appear under the row they belong to and stay until dismissed with
the × button. Save, import and delete confirmations appear the same way and retire
after four seconds. Enabling, disabling and restarting are silent on success. A
bulk failure appears once, above the list, and is dismissible the same way.

## Internationalization

The page uses the same mechanism as Harness's own client packages, and the same
delivery: all eight dictionaries are `ctx.locale.register(namespace, { … })` calls
made once at activation, inline in `client.js`. Registration publishes a locale
change, so switching language in Settings re-renders every label — no reload and no
request. A key missing from the active dictionary falls back to English, one key at
a time.

Each language also ships `locale/<id>.json` with `meta.title` and
`meta.description`, which is what the Plugins inventory shows for this bundle in
that language; those files carry no runtime strings.

## Design notes

- The bundle has two halves. `dist/host.js` serves catalogue and draft-probe
  routes. `dist/client.js` uses the shipped manager/settings Remotes for fleet
  status, restart and configuration, and the bundle's HTTP routes for tool
  descriptions and isolated draft probes. All client transport access is in `api.ts`.
- Writes are path-addressed (`servers.<name>`) against the section as stored, with
  a revision check that refuses a write instead of overwriting a concurrent change.
  No configuration file is rewritten by this plugin.
- **Editing preserves tuning.** The form owns transport, command, arguments,
  environment, working directory, URL, headers and `enabled`; every other field is
  carried over unchanged instead of being dropped.
- Styles use only `--dsw-alias-*` theme variables, so light and dark themes both
  apply; the plugin imports no Harness client package.

### On Tailwind CSS

The page uses scoped CSS and Harness theme tokens. Tailwind is not required for
this surface. If it is introduced later, keep it at build time, disable preflight,
prefix generated classes, and map colours to the host's theme variables. Runtime
CDN styles and global resets would affect the surrounding Harness application.

## Limits

- Only the global manager plane is listed. Instances pinned in a `cordis.yml` row
  or mounted by an agent preset are not managed and do not appear — and a managed
  entry cannot reuse such an instance's name.
- Registered (plugin-owned) servers are read-only and not selectable/exportable
  here; their owning plugin defines them.
- Tool descriptions cover the tools the Host has registered at that moment.
  A server that has connected only partially, or whose tool names Harness rewrote,
  can differ from the advertised list.
- The catalogue uses the live manager inventory to attribute tool names. If a
  public tool name matches more than one server (for example `alpha` and
  `alpha__beta`), the affected catalogue shows an explicit namespace ambiguity
  error. The installed tool runtime does not expose ownership metadata, so the
  page refuses to guess or mix another server's tools into the list.
- There is no OAuth sign-in flow; a server that requires authorization shows as an
  ordinary connection failure, exactly as the manager reports it.
- Internationalization mirrors the shipped client packages: 124 keys per language,
  all eight dictionaries inline in `client.js` and registered once at activation,
  because the client module cannot fetch package assets.

## Project layout

```
src/host/index.ts          Host activation and lifecycle wiring
src/host/catalog.ts        tool ownership and catalogue projection
src/host/service.ts        catalogue interface
src/host/route.ts          catalogue HTTP route
src/host/probe.ts          isolated draft probe HTTP route
src/client/index.ts        ES module entry; the build supplies the loader envelope
src/client/plugin.ts       locale registration and settings-slot activation
src/client/types.ts        local domain, Remote and presentation contracts
src/client/api.ts          transport access and validation of external responses
src/client/model.ts        import/export, parsing and presentation rules
src/client/draft.ts        pure draft conversion and validation
src/client/hooks/          fleet, catalogue, editor, server-action and export state
src/client/section.ts      page composition and local selection state
src/client/components/     presentational controls and dialogs
src/client/locale/         one ES module dictionary per language
src/client/style.css       stylesheet scoped to .mcps_*
scripts/build.mjs          esbuild CLI orchestration and DSH loader wrapping
test/                     module, transport, loader and React regression checks
test/helpers/             reusable DOM, API and loader test fixtures
dist/client.js            generated browser bundle (do not edit)
dist/host.js              generated Host bundle (do not edit)
locale/<id>.json           Plugin Manager metadata
cordis.patch.yml          profile row inserted by the bundle
```

## Development

Use **Node.js 22.22.2+, 24.15.0+, or 26+**, as listed in `engines`. Tests
import erasable TypeScript source directly;
esbuild and the real React/DOM test dependencies are development dependencies.
DSH supplies React at runtime, and it remains external to the generated bundle.

```bash
npm ci            # install the locked dependencies
npm run typecheck # strict TypeScript check of every source module
npm run build     # regenerate dist/client.js and dist/host.js
npm test          # run checks against source and current artifacts
npm run check     # typecheck, build, then every check; stop on failure
```

Edit source modules, then rebuild. Client files use ordinary ES module imports
and exports. There is no shared lexical scope, manual part order, source marker,
or regular-expression import removal. The standard bundler resolves dependencies;
its final client output is wrapped in `window.__ModuleLoader__.load(...)` with
`inject` and `apply` exports. The build invokes the esbuild CLI with inherited
stdio so it also works in hosts that restrict child-process output pipes.

Domain data, raw Remotes and local operations have separate contracts. `api.ts`
validates external data before page modules consume it. The page uses hooks for
subscriptions and operation lifetimes; pure configuration rules are exported from
`model.ts` and `draft.ts`. Presentation controls receive typed props and report
intent through callbacks.

### Styles

`style.css` is bundled as text and passed to Section by plugin activation. The
page renders one `<style data-plugin-css="mcp-servers">` element, so loading the
client remains atomic. CSS selectors are scoped to this page and colours use the
Host theme tokens. No global reset or separate CSS asset is introduced.

### Verification

The suite runs without a real browser. React tests use jsdom with the real React
server/DOM renderers and Testing Library; they cover controlled fields, dialog
focus and Escape, cancellation, subscriptions and operation state. Module tests
import public exports directly. They do not rewrite source text or replace hooks.
One loader fixture evaluates the unmodified built artifact with DSH's external
React dependency to verify activation, dictionaries and the inline stylesheet.

| Check | Coverage |
|---|---|
| `import-export.test.mjs` | 63 assertions for portable formats, cwd, literal arguments/environment and draft validation |
| `draft-probe.test.mjs` | Host requests, validation, byte limits, cancellation, current-draft transport and real page interactions |
| `state-modules.test.mjs` | Catalogue generations, legal special names, StrictMode effect replay, save/import/delete operations |
| `api-contract.test.mjs` | Exact manager namespace selection, unrelated settings, fallback and invalid manager responses |
| `render-smoke.mjs` | Public components through real React rendering, controlled fields, dialog focus and Escape |
| `check-host-routes.mjs` | Catalogue registration, HTTP handling, trust checks and ambiguous tool ownership |
| `check-identifiers.mjs` | Unmodified client loader interface, external dependency, activation and rendering |
| `check-locales.mjs` | Registered dictionaries, source translation references and Plugin Manager metadata |
| `check-css.mjs` | Selector scoping, CSS balance, actual inline stylesheet and theme tokens |
| `audit-dead-code.mjs` | TypeScript diagnostics for unused private declarations and imports |

`npm test` expects up-to-date build artifacts; `npm run check` rebuilds them after
a successful type check. Changes to Host modules require a **Host restart** to load
the new module generation. Rebuild and reload the page for client changes. The
checks above do not imply an end-to-end check of the running Harness page.
