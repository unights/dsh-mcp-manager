import { createElement as h, useEffect, useState } from 'react';
import { interpolate } from './model.ts';
import { useFleet } from './hooks/fleet.ts';
import { useCatalog } from './hooks/catalog.ts';
import { useServerActions } from './hooks/server-actions.ts';
import { useDraftEditor } from './hooks/draft-editor.ts';
import { useExport } from './hooks/export.ts';
import { ServerCard } from './components/rows.ts';
import { IconClose, IconPlus } from './components/icons.ts';
import { ConfirmDeleteDialog, ExportDialog } from './components/dialogs.ts';
import { DraftDialog } from './components/draft-dialog.ts';
import type { SectionProps, VNode } from './types.ts';

/** Page composition and local selection state; domain operations live behind hooks. */
export function Section({ api, t, subscribeLocale, styleText = '' }: SectionProps): VNode {
  const [, setLocaleRevision] = useState(0);
  useEffect(() => subscribeLocale(() => setLocaleRevision(value => value + 1)), [subscribeLocale]);
  const fleet = useFleet(api);
  const catalogs = useCatalog(api, fleet.rows);
  const actions = useServerActions(api, t, fleet, catalogs);
  const editor = useDraftEditor(api, t, fleet, catalogs, actions);
  const exporter = useExport();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const { rows, servers, doc, nsView, writable, loadError, watchError } = fleet;
  const selectedNames = rows.filter(row => row.removable && selected[row.name] === true).map(row => row.name);
  const configuredNames = rows.filter(row => row.removable).map(row => row.name);
  const openExport = (names = selectedNames) => exporter.openExport(names, fleet.configured);
  const refresh = async () => {
    setReloading(true);
    actions.clearAllFeedback();
    try { await fleet.loadDoc(); } finally { setReloading(false); }
  };
  const confirmDelete = async () => {
    const deleted = await actions.performDelete();
    if (!deleted) return;
    if (expanded && deleted.includes(expanded)) setExpanded(null);
    setSelected({});
    setSelectionMode(false);
  };
  const toggleExpand = (name: string) => {
    if (expanded === name) { setExpanded(null); return; }
    setExpanded(name);
    void catalogs.loadTools(name, { silent: catalogs.catalog.has(name) });
  };
  const countText = rows.length === 1 ? t('countOne') : interpolate(t('count'), { count: rows.length });
  const countLabel = servers === null ? watchError ? t('statusUnavailable') : t('loading') : countText;
  const children: VNode[] = [
    h('h2', { className: 'mcps_heading', key: 'heading' }, t('heading')),
    h('div', { className: 'mcps_toolbar', key: 'toolbar' },
      h('span', { className: 'mcps_count' }, countLabel),
      h('button', { type: 'button', className: 'mcps_button', 'aria-pressed': selectionMode,
        disabled: configuredNames.length === 0, onClick: () => { setSelectionMode(!selectionMode); setSelected({}); } }, t('selectMode')),
      h('button', { type: 'button', className: 'mcps_button', disabled: reloading, onClick: refresh,
        'data-busy': reloading ? 'true' : undefined, 'aria-busy': reloading || undefined }, t('reload')),
      h('button', { type: 'button', className: 'mcps_button mcps_primary', disabled: !writable || editor.draft !== null,
        onClick: () => { setExpanded(null); editor.openAdd(); } }, h(IconPlus), t('add'))),
  ];
  if (selectionMode) children.push(h('div', { className: 'mcps_actions', key: 'selection' },
    h('span', { className: 'mcps_count' }, interpolate(t('selectedCount'), { count: selectedNames.length })),
    h('button', { type: 'button', className: 'mcps_button mcps_small', onClick: () => setSelected(Object.fromEntries(configuredNames.map(name => [name, true]))) }, t('selectAll')),
    h('button', { type: 'button', className: 'mcps_button mcps_small', onClick: () => setSelected(Object.fromEntries(configuredNames.filter(name => selected[name] !== true).map(name => [name, true]))) }, t('selectInvert')),
    h('button', { type: 'button', className: 'mcps_button mcps_small', disabled: !selectedNames.length, onClick: () => openExport() }, t('export')),
    h('button', { type: 'button', className: 'mcps_button mcps_small mcps_danger', disabled: !selectedNames.length || actions.isPending('delete:bulk'),
      onClick: () => actions.askDelete(selectedNames) }, actions.isPending('delete:bulk') ? t('actionDeleting') : t('actionDelete'))));
  if (loadError) children.push(h('div', { className: 'mcps_banner', key: 'loadError', role: 'alert' }, interpolate(t('loadError'), { error: loadError })));
  if (watchError) children.push(h('div', { className: 'mcps_banner', key: 'watchError', role: 'alert' }, interpolate(t('watchError'), { error: watchError })));
  if (actions.bulkError) children.push(h('div', { className: 'mcps_feedback', key: 'bulkError' },
    h('span', { className: 'mcps_feedbackText mcps_failure', role: 'alert' }, actions.bulkError),
    h('button', { type: 'button', className: 'mcps_iconButton', 'aria-label': t('dismiss'), title: t('dismiss'),
      onClick: () => actions.setBulkError(null) }, h(IconClose))));
  if (doc && !doc.writable) children.push(h('div', { className: 'mcps_notice', key: 'readonly' }, t('readOnly')));
  if (doc?.writable && !nsView) children.push(h('div', { className: 'mcps_notice', key: 'noManager' }, t('noManager')));
  if (servers === null && !loadError && !watchError) children.push(h('p', { className: 'mcps_empty', key: 'loading' }, t('loading')));
  else if (!rows.length) children.push(h('div', { className: 'mcps_emptyBox', key: 'empty' },
    h('p', { className: 'mcps_empty' }, t('none')), h('p', { className: 'mcps_hint' }, t('noneHint'))));
  else children.push(h('ul', { className: 'mcps_cards', key: 'cards' }, rows.map(row => h(ServerCard, {
    key: row.name, t, row, writable, isPending: actions.isPending, selectionMode, selected: Boolean(selected[row.name] === true),
    onSelect: (name, active) => setSelected(current => { if (active) return { ...current, [name]: true }; const next = { ...current }; delete next[name]; return next; }),
    feedback: Object.hasOwn(actions.feedback, row.name) ? actions.feedback[row.name] : null, expanded: expanded === row.name,
    panel: expanded === row.name ? catalogs.catalog.get(row.name) ?? null : null,
    onToggleExpand: toggleExpand, onExport: name => openExport([name]), onRestart: actions.restart,
    onSetEnabled: actions.setEnabled, onEdit: target => { setExpanded(null); editor.openEdit(target); },
    onDelete: target => actions.askDelete([target.name]), onDismissFeedback: actions.clearFeedback,
  }))));
  children.push(h('style', { key: 'style', 'data-plugin-css': 'mcp-servers' }, styleText));
  children.push(h(DraftDialog, { key: 'draft', editor, t }));
  if (actions.deleteIntent) {
    const intent = actions.deleteIntent;
    children.push(h(ConfirmDeleteDialog, { key: 'delete', t, names: intent.names, busy: intent.busy,
      onClose: () => { if (!intent.busy) actions.setDeleteIntent(null); }, onConfirm: confirmDelete }));
  }
  if (exporter.exportState) children.push(h(ExportDialog, { key: 'export', t, exportState: exporter.exportState,
    onClose: exporter.closeExport, onFormat: exporter.changeExportFormat, onCopy: exporter.copyExport, onDownload: exporter.downloadExport }));
  return h('div', { className: 'mcps_section' }, children);
}
