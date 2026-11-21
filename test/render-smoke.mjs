// Public components render through React's server and DOM renderers.
import './helpers/dom.mjs';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { createElement as h, Fragment, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Section } from '../src/client/section.ts';
import { ServerCard, ExpandedBody } from '../src/client/components/rows.ts';
import { FormTab, JsonTab, renderJsonTab } from '../src/client/components/fields.ts';
import { Modal, ModeSwitch, avatarStyle, renderInlineCode } from '../src/client/components/primitives.ts';
import { ExportDialog, ConfirmDeleteDialog } from '../src/client/components/dialogs.ts';
import { NavIcon, IconPlus, IconClose } from '../src/client/components/icons.ts';
import { emptyDraft } from '../src/client/draft.ts';
import { saveOps, testStatusOf, validateServerName } from '../src/client/model.ts';
import { configuredRow, noop, pageApi, subscribeLocale, t } from './helpers/fixtures.mjs';

afterEach(cleanup);
const markup = (Component, props = {}) => renderToStaticMarkup(h(Component, props));
const panel = { loading: false, tools: [{ name: 'search', description: 'Search things' }], unavailable: false, connected: true };
function cardProps(overrides = {}) {
  return {
    t, row: configuredRow(), writable: true, isPending: () => false,
    selectionMode: false, selected: false, feedback: null, expanded: false, panel: null,
    onSelect: noop, onToggleExpand: noop, onExport: noop, onRestart: noop, onSetEnabled: noop,
    onEdit: noop, onDelete: noop, onDismissFeedback: noop, ...overrides,
  };
}
const formDraft = { ...emptyDraft(), tab: 'form', name: 'github', command: 'node' };
function jsonState(overrides = {}) {
  return { text: '', placeholder: 'Paste definitions', rows: [], skipped: [], error: null, message: null, parsing: false, importing: false, ...overrides };
}

test('icons and inline helper fragments render valid markup', () => {
  for (const Icon of [NavIcon, IconPlus, IconClose]) assert.match(markup(Icon), /<svg\b/);
  assert.match(renderToStaticMarkup(h('p', null, renderInlineCode('Use `${credential:NAME}` here'))), /<code class="mcps_code">\$\{credential:NAME\}<\/code>/);
  assert.equal(renderToStaticMarkup(h('p', null, renderInlineCode('no code here'))), '<p>no code here</p>');
  assert.deepEqual(avatarStyle('github'), avatarStyle('github'));
  assert.notDeepEqual(avatarStyle('github'), avatarStyle('other'));
});

test('server rows render their public states and actions', () => {
  assert.match(markup(ServerCard, cardProps()), /github/);
  assert.match(markup(ServerCard, cardProps({ selectionMode: true, selected: true })), /type="checkbox"[^>]*checked=""/);
  assert.match(markup(ServerCard, cardProps({ expanded: true, panel })), /Search things/);
  assert.match(markup(ServerCard, cardProps({ expanded: true, panel: { ...panel, loading: true, tools: [] } })), /Reading tools/);
  assert.match(markup(ServerCard, cardProps({ expanded: true, panel: { ...panel, tools: [], unavailable: true, error: 'HTTP 404' } })), /HTTP 404/);
  assert.match(markup(ServerCard, cardProps({ expanded: true, panel: { ...panel, tools: [] } })), /No tools are registered/);
  assert.match(markup(ServerCard, cardProps({ expanded: true, panel: { ...panel, tools: [], connected: false } })), /Not connected/);
  const registered = markup(ServerCard, cardProps({ row: configuredRow({ source: 'registered', entry: null, removable: false }) }));
  assert.match(registered, /Plugin/);
  assert.doesNotMatch(registered, /aria-label="Edit"/);
  assert.match(markup(ServerCard, cardProps({ row: configuredRow({ status: { state: 'failed', reason: 'cleanup', result: { closeConfirmed: false } } }) })), /Failed/);
  assert.match(markup(ServerCard, cardProps({ row: configuredRow({ entry: { transport: 'stdio', command: 'node', enabled: false }, status: { state: 'disabled' } }) })), /aria-checked="false"/);
  assert.match(markup(ServerCard, cardProps({ feedback: { tone: 'error', text: 'boom' } })), /role="alert">boom/);
});

test('expanded catalogue renders loading, tools, unreachable and offline states', () => {
  assert.match(markup(ExpandedBody, { t, panel: null }), /Reading tools/);
  assert.match(markup(ExpandedBody, { t, panel }), /<td[^>]*>search<\/td>/);
  assert.match(markup(ExpandedBody, { t, panel: { ...panel, unavailable: true, error: 'namespace ambiguity' } }), /namespace ambiguity/);
  assert.match(markup(ExpandedBody, { t, panel: { ...panel, tools: [], connected: false } }), /Not connected/);
});

test('form renders transport fields, validation messages and inherited-name protection', () => {
  const base = { t, draft: formDraft, onChange: noop, onValidateName: () => null };
  const stdio = markup(FormTab, base);
  assert.match(stdio, /for="mcps-fcommand"/);
  assert.match(stdio, /for="mcps-fargs"/);
  assert.doesNotMatch(stdio, /for="mcps-furl"/);
  const http = markup(FormTab, { ...base, draft: { ...formDraft, transport: 'streamable-http' } });
  assert.match(http, /for="mcps-furl"/);
  assert.match(http, /for="mcps-fheaders"/);
  assert.doesNotMatch(http, /for="mcps-fcommand"/);
  assert.match(markup(FormTab, { ...base, draft: { ...formDraft, error: 'bad name', errorField: 'name' } }), /aria-invalid="true"/);
  assert.match(markup(FormTab, { ...base, draft: { ...formDraft, mode: 'edit', canRename: false } }), /id="mcps-fname"[^>]*disabled=""/);
  assert.match(markup(FormTab, { ...base, draft: { ...formDraft, testing: true } }), /disabled=""/);
});

test('JSON view exposes selection metadata while rendering as a normal component', () => {
  const state = jsonState({ text: '{}', rows: [
    { name: 'a', originalName: 'a', entry: { command: 'node' }, changed: false, collision: false, selected: true, warning: null },
    { name: 'taken', originalName: 'taken', entry: { command: 'node' }, changed: false, collision: true, selected: true, warning: null },
    { name: 'renamed', originalName: 'old name', entry: { url: 'https://x' }, changed: true, collision: false, selected: false, warning: 'sse' },
  ], skipped: [{ name: 'bad', reason: 'entry' }], message: 'Found entries' });
  const props = { t, json: state, onText: noop, onSelect: noop };
  const rendered = renderJsonTab(props);
  assert.equal(rendered.selectedCount, 1);
  assert.equal(renderToStaticMarkup(rendered.body), markup(JsonTab, props));
  assert.match(markup(JsonTab, props), /Already exists/);
  assert.match(markup(JsonTab, props), /SSE transport imported/);
  assert.match(markup(JsonTab, props), /Skipped/);
  assert.match(markup(JsonTab, { ...props, json: jsonState({ error: 'Bad JSON' }) }), /role="alert">Bad JSON/);
});

test('modal and action dialogs render with accessible names and actual React children', () => {
  const modal = markup(Modal, { t, title: 'Example', titleId: 'example', onClose: noop,
    headerExtra: h('span', null, 'Extra'), footer: h('button', null, 'Finish'), children: h('p', null, 'Body') });
  assert.match(modal, /role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="example"/);
  assert.match(modal, /<p>Body<\/p>/);
  assert.match(modal, /Finish/);
  assert.match(markup(ModeSwitch, { t, tab: 'form', busy: false, onSelect: noop }), /aria-pressed="true">Form/);
  assert.match(markup(ModeSwitch, { t, tab: 'json', busy: true, onSelect: noop }), /disabled=""/);
  assert.match(markup(ExportDialog, { t, exportState: { format: 'mcp_servers_camel', entries: [], text: '{}', copied: true },
    onClose: noop, onFormat: noop, onCopy: noop, onDownload: noop }), /Copied/);
  assert.match(markup(ConfirmDeleteDialog, { t, names: ['github'], busy: false, onClose: noop, onConfirm: noop }), /Delete “github”/);
  assert.match(markup(ConfirmDeleteDialog, { t, names: ['a', 'b', 'c', 'd'], busy: true, onClose: noop, onConfirm: noop }), /Deleting/);
});

test('real React DOM updates controlled form fields and transport selection', async () => {
  function FormHarness() {
    const [draft, setDraft] = useState(formDraft);
    return h(FormTab, { t, draft, onChange: setDraft, onValidateName: () => null });
  }
  const user = userEvent.setup();
  render(h(FormHarness));
  const command = screen.getByRole('textbox', { name: 'Command', exact: true });
  await user.clear(command);
  await user.type(command, 'new-command');
  assert.equal(command.value, 'new-command');
  await user.click(screen.getByRole('tab', { name: 'Streamable HTTP (remote service)' }));
  assert.equal(screen.queryByRole('textbox', { name: 'Command', exact: true }), null);
  assert.equal(screen.getByRole('tab', { name: 'Streamable HTTP (remote service)' }).getAttribute('aria-selected'), 'true');
  await user.type(screen.getByRole('textbox', { name: 'URL', exact: true }), 'https://example.test/mcp');
  assert.equal(screen.getByRole('textbox', { name: 'URL', exact: true }).value, 'https://example.test/mcp');
});

test('real modal effects focus the dialog, close on Escape and restore trigger focus', async () => {
  function DialogHarness() {
    const [open, setOpen] = useState(false);
    return h(Fragment, null,
      h('button', { onClick: () => setOpen(true) }, 'Open example'),
      open ? h(Modal, { t, title: 'Example', titleId: 'example', onClose: () => setOpen(false) }, h('input', { 'aria-label': 'Example field' })) : null);
  }
  const user = userEvent.setup();
  render(h(DialogHarness));
  const trigger = screen.getByRole('button', { name: 'Open example' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Example' });
  assert.ok(document.activeElement === within(dialog).getByRole('button', { name: 'Close', exact: true }), 'the first focusable dialog control receives focus');
  await user.click(within(dialog).getByRole('textbox', { name: 'Example field' }));
  await user.keyboard('{Escape}');
  assert.equal(screen.queryByRole('dialog'), null);
  assert.ok(document.activeElement === trigger, 'closing restores focus to the opener');
});

test('Section is a valid React component during static rendering', () => {
  const fixture = pageApi();
  const html = markup(Section, { api: fixture.api, t, subscribeLocale, styleText: '.test{}' });
  assert.match(html, /MCP servers/);
  assert.match(html, /Loading/);
  assert.match(html, /data-plugin-css="mcp-servers"/);
  assert.equal(fixture.calls.describe, 0, 'server rendering must not execute effects');
  assert.equal(fixture.calls.watch, 0);
});

test('public presentation rules preserve probe status, name validation and atomic rename semantics', () => {
  const key = (value) => value;
  const cases = [
    [{ testing: true }, 'idle', 'testConnecting'],
    [{ testResult: { ok: true, toolNames: ['a', 'b'], durationMs: 42 } }, 'ok', 'testSucceeded'],
    [{ testResult: { ok: false, stage: 'connect', message: 'boom' } }, 'error', 'testFailed'],
    [{ testError: 'transport died' }, 'error', 'testFailed'],
    [{ error: 'conflict', errorField: null }, 'error', 'conflict'],
    [{ error: 'bad', errorField: 'name' }, null, null],
    [null, null, null],
  ];
  for (const [draft, tone, text] of cases) {
    const result = testStatusOf(key, draft);
    assert.equal(result?.tone ?? null, tone);
    assert.equal(result?.text ?? null, text);
  }
  for (const [value, existing, expected] of [
    ['github', [], null], ['github ', [], null], [' github', [], null],
    ['my server', [], 'invalidName'], ['', [], 'invalidName'], ['x'.repeat(33), [], 'invalidName'],
    ['github', ['github'], 'nameTaken'], ['x'.repeat(32), [], null],
  ]) assert.equal(validateServerName(key, value, existing), expected);
  assert.deepEqual(saveOps({ name: 'new ', originalName: null }, { transport: 'stdio' }), [
    { op: 'set', path: ['servers', 'new'], value: { transport: 'stdio' } },
  ]);
  assert.deepEqual(saveOps({ name: 'a', originalName: 'a' }, {}), [{ op: 'set', path: ['servers', 'a'], value: {} }]);
  assert.deepEqual(saveOps({ name: 'b', originalName: 'a' }, {}), [
    { op: 'set', path: ['servers', 'b'], value: {} }, { op: 'unset', path: ['servers', 'a'] },
  ]);
});
