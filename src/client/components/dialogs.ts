import { createElement as h } from 'react';
import type { ChangeEvent, FocusEvent } from 'react';
import type { ConfirmDeleteDialogProps, ExportDialogProps, VNode } from '../types.ts';
import { EXPORT_CONTAINERS, interpolate } from '../model.ts';
import { Modal } from './primitives.ts';

export function ExportDialog(props: ExportDialogProps): VNode {
  const t = props.t;
  const state = props.exportState;
  const body: VNode[] = [
    h(
      'div',
      { className: 'mcps_field', key: 'format' },
      h('label', { className: 'mcps_label', htmlFor: 'mcps-format' }, t('exportFormat')),
      h(
        'select',
        {
          id: 'mcps-format',
          className: 'mcps_select',
          value: state.format,
          onChange: function (event: ChangeEvent<HTMLSelectElement>) {
            const format = event.currentTarget.value;
            if (format === 'mcp_servers_camel' || format === 'servers_typed' || format === 'mcp_servers_snake' || format === 'mcp_compact') {
              props.onFormat(format);
            }
          },
        },
        h('option', { value: 'mcp_servers_camel' }, EXPORT_CONTAINERS.mcp_servers_camel),
        h('option', { value: 'servers_typed' }, EXPORT_CONTAINERS.servers_typed),
        h('option', { value: 'mcp_servers_snake' }, EXPORT_CONTAINERS.mcp_servers_snake),
        h('option', { value: 'mcp_compact' }, EXPORT_CONTAINERS.mcp_compact),
      ),
    ),
    h(
      'div',
      { className: 'mcps_field', key: 'text' },
      h('label', { className: 'mcps_label', htmlFor: 'mcps-export' }, t('export')),
      h('textarea', {
        id: 'mcps-export',
        className: 'mcps_textarea mcps_json',
        value: state.text,
        readOnly: true,
        spellCheck: false,
        onFocus: function (event: FocusEvent<HTMLTextAreaElement>) {
          event.currentTarget.select();
        },
      }),
    ),
  ];
  return h(
    Modal,
    {
      t,
      title: t('exportTitle'),
      titleId: 'mcps-export-title',
      onClose: props.onClose,
      footer: [
        h('button', { key: 'cancel', type: 'button', className: 'mcps_button', onClick: props.onClose }, t('cancel')),
        h('button', { key: 'download', type: 'button', className: 'mcps_button', onClick: props.onDownload }, t('exportDownload')),
        h('button', { key: 'copy', type: 'button', className: 'mcps_button mcps_primary', onClick: props.onCopy }, state.copied ? t('exportCopied') : t('exportCopy')),
      ],
    },
    body,
  );
}

/** Second confirmation for one or several deletions. */
export function ConfirmDeleteDialog(props: ConfirmDeleteDialogProps): VNode {
  const t = props.t;
  const names = props.names;
  const title = names.length > 1
    ? interpolate(t('deleteManyTitle'), { count: names.length })
    : interpolate(t('deleteTitle'), { name: names[0] });
  return h(
    Modal,
    {
      t,
      title,
      titleId: 'mcps-delete-title',
      dialogClassName: 'mcps_dialogSmall',
      onClose: props.busy ? function () {} : props.onClose,
      footer: [
        h('span', { key: 'grow', className: 'mcps_grow' }),
        h('button', { key: 'cancel', type: 'button', className: 'mcps_button', onClick: props.onClose, disabled: props.busy }, t('cancel')),
        h(
          'button',
          {
            key: 'confirm',
            type: 'button',
            className: 'mcps_button mcps_destructive',
            onClick: props.onConfirm,
            disabled: props.busy,
          },
          props.busy ? t('actionDeleting') : t('deleteConfirm'),
        ),
      ],
    },
    h(
      'div',
      { className: 'mcps_confirmBody' },
      h('p', { className: 'mcps_confirmNames' }, names.length > 3 ? names.slice(0, 3).join(', ') + ' +' + String(names.length - 3) : names.join(', ')),
      h('p', { className: 'mcps_confirmHint' }, t('stopThenDelete')),
    ),
  );
}
