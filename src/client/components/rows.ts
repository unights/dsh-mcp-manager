import { createElement as h } from 'react';
import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import type { ExpandedBodyProps, ServerCardProps, VNode } from '../types.ts';
import { interpolate, renderStatus, TONE_TOKEN, transportOf } from '../model.ts';
import { IconChevron, IconClose, IconDelete, IconEdit, IconExport, IconRestart, iconButton } from './icons.ts';
import { avatarStyle } from './primitives.ts';

/** Expanded body: the registered tool catalogue, or why there is none. */
export function ExpandedBody(props: ExpandedBodyProps): VNode {
  const t = props.t;
  const panel = props.panel;
  function wrap(children: ReactNode): VNode {
    return h('div', { className: 'mcps_details', 'aria-live': 'polite' }, children);
  }

  if (!panel || panel.loading) {
    return wrap(h('div', { className: 'mcps_detail', key: 'loading' }, t('toolsLoading')));
  }
  if (panel.unavailable) {
    const suffix = panel.error ? ' (' + panel.error + ')' : '';
    return wrap(h('div', { className: 'mcps_detail', key: 'unavailable' }, t('toolsUnavailable') + suffix));
  }
  const tools = panel.tools;
  if (tools.length === 0) {
    return wrap(h('div', { className: 'mcps_detail', key: 'empty' }, panel.connected ? t('noRegisteredTools') : t('notConnected')));
  }

  return wrap(
    h(
      'table',
      { className: 'mcps_table', key: 'tools' },
      h(
        'tbody',
        null,
        tools.map(function (tool) {
          return h(
            'tr',
            { key: tool.name },
            h('td', { className: 'mcps_tdName' }, tool.name),
            h('td', { className: 'mcps_tdDesc' }, tool.description),
          );
        }),
      ),
    ),
  );
}

/** One row: multi-select or expand, monogram, summary, actions, switch. */
export function ServerCard(props: ServerCardProps): VNode {
  const t = props.t;
  const row = props.row;
  const view = renderStatus(t, row.status);
  const configured = row.source === 'configured';
  const writable = props.writable && configured;
  const pending = props.isPending;
  const initial = row.name.slice(0, 1) || '?';
  const enabled = row.entry?.enabled !== false;
  const restartsBlocked = view.blocked === true || row.entry?.enabled === false;
  const liveState = row.status.state;
  // The manager queues restarts before the connection reaches a stable state.
  const rowBusy = pending('restart:' + row.name) || pending('switch:' + row.name) ||
    pending('delete:bulk') || liveState === 'connecting' || liveState === 'starting';
  const countText = typeof row.status.toolCount === 'number'
    ? row.status.toolCount === 1 ? t('toolsOne') : interpolate(t('tools'), { count: row.status.toolCount })
    : null;
  const stateDotStyle: CSSProperties & { '--mcps-tone': string } = { '--mcps-tone': TONE_TOKEN[view.tone] };

  const leading = props.selectionMode
    ? configured && row.removable
      ? h(
          'label',
          { className: 'mcps_expand mcps_selectStrip', key: 'check' },
          h('input', {
            type: 'checkbox',
            className: 'mcps_checkbox',
            checked: props.selected,
            'aria-label': interpolate(t('selectServer'), { name: row.name }),
            onChange: function (event: ChangeEvent<HTMLInputElement>) {
              props.onSelect(row.name, event.currentTarget.checked);
            },
          }),
        )
      : h('span', { className: 'mcps_expand', key: 'check' })
    : h(
        'button',
        {
          key: 'expand',
          type: 'button',
          className: 'mcps_expand',
          'data-open': props.expanded ? 'true' : 'false',
          'aria-expanded': props.expanded,
          'aria-label': props.expanded ? t('collapseDetails') : t('expandDetails'),
          title: props.expanded ? t('collapseDetails') : t('expandDetails'),
          onClick: () => props.onToggleExpand(row.name),
        },
        h('span', { className: 'mcps_expandMark', 'aria-hidden': 'true' }, h(IconChevron, null)),
      );

  const actions: VNode[] = [];
  if (configured) {
    actions.push(iconButton({ key: 'edit', label: t('actionEdit'), icon: IconEdit, disabled: !writable || rowBusy, onClick: () => props.onEdit(row) }));
  }
  actions.push(iconButton({
    key: 'restart',
    label: t('actionRestart'),
    icon: IconRestart,
    disabled: rowBusy || !row.present || restartsBlocked,
    title: restartsBlocked
      ? row.entry?.enabled === false ? t('restartDisabledHint') : t('restartBlockedHint')
      : t('actionRestart'),
    onClick: () => props.onRestart(row),
  }));
  if (configured) {
    actions.push(
      iconButton({ key: 'export', label: t('export'), icon: IconExport, disabled: rowBusy, onClick: () => props.onExport(row.name) }),
      iconButton({
        key: 'delete',
        label: t('actionDelete'),
        icon: IconDelete,
        danger: true,
        disabled: !writable || !row.removable || rowBusy,
        title: row.removable ? t('actionDelete') : t('deleteInherited'),
        onClick: function () {
          if (row.removable) props.onDelete(row);
        },
      }),
    );
  }
  const toggle = configured
    ? h(
        'button',
        {
          key: 'switch',
          type: 'button',
          role: 'switch',
          className: 'mcps_switch',
          'data-on': enabled ? 'true' : 'false',
          'aria-checked': enabled,
          'aria-label': row.name,
          title: enabled ? t('actionDisable') : t('actionEnable'),
          disabled: !writable || rowBusy,
          onClick: () => props.onSetEnabled(row, !enabled),
        },
        h('span', { className: 'mcps_switchKnob', 'aria-hidden': 'true' }),
      )
    : null;

  return h(
    'li',
    { className: 'mcps_card' },
    h(
      'div',
      { className: 'mcps_serverRow' },
      leading,
      h(
        'div',
        { className: 'mcps_rowMain' },
        h('span', { className: 'mcps_avatar', style: avatarStyle(row.name), 'aria-hidden': 'true' }, initial),
        h(
          'div',
          { className: 'mcps_info' },
          h(
            'div',
            { className: 'mcps_infoTop' },
            h('span', { className: 'mcps_name', title: row.name }, row.name),
            row.entry
              ? h('span', { className: 'mcps_badge' }, transportOf(row.entry) === 'streamable-http' ? t('transportHttpShort') : t('transportStdioShort'))
              : h('span', { className: 'mcps_badge' }, t('sourceRegistered')),
            row.inherited ? h('span', { className: 'mcps_badge' }, t('inherited')) : null,
          ),
          h(
            'div',
            { className: 'mcps_infoBottom', title: view.tooltip || view.label },
            h('span', { className: 'mcps_stateDot', style: stateDotStyle, 'aria-hidden': 'true' }),
            h('span', { className: 'mcps_stateText' }, view.label),
            countText ? h('span', { className: 'mcps_sep', 'aria-hidden': 'true' }, '·') : null,
            countText ? h('span', { className: 'mcps_stateText' }, countText) : null,
          ),
        ),
        h('div', { className: 'mcps_iconActions' }, actions),
        toggle,
      ),
    ),
    props.expanded ? h(ExpandedBody, { t, panel: props.panel }) : null,
    props.feedback
      ? h(
          'div',
          { className: 'mcps_feedback' },
          h(
            'span',
            {
              className: 'mcps_feedbackText' + (props.feedback.tone === 'error' ? ' mcps_failure' : ''),
              role: props.feedback.tone === 'error' ? 'alert' : 'status',
            },
            props.feedback.text,
          ),
          h(
            'button',
            { type: 'button', className: 'mcps_iconButton', 'aria-label': t('dismiss'), title: t('dismiss'), onClick: () => props.onDismissFeedback(row.name) },
            h(IconClose, null),
          ),
        )
      : null,
  );
}
