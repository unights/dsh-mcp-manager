import { createElement as h } from 'react';
import type { ChangeEvent, ChangeEventHandler, FocusEventHandler, InputHTMLAttributes } from 'react';
import type { Draft, FormTabProps, JsonTabProps, VNode } from '../types.ts';
import { interpolate } from '../model.ts';
import { renderInlineCode } from './primitives.ts';

const FIELD_LABELS = {
  name: 'fieldName',
  command: 'fieldCommand',
  url: 'fieldUrl',
  env: 'fieldEnv',
  headers: 'fieldHeaders',
  args: 'fieldArgs',
  cwd: 'fieldCwd',
};

type FieldName = keyof typeof FIELD_LABELS;
type FieldElement = HTMLInputElement | HTMLTextAreaElement;

interface FieldOptions {
  name: FieldName;
  value: string;
  required?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  patch: (value: string) => Partial<Draft>;
  onChange?: ChangeEventHandler<FieldElement>;
  onBlur?: FocusEventHandler<FieldElement>;
}

type SharedFieldProps = Pick<InputHTMLAttributes<FieldElement>,
  'id' | 'className' | 'value' | 'disabled' | 'spellCheck' | 'placeholder' |
  'aria-required' | 'aria-invalid' | 'aria-describedby' | 'onChange' | 'onBlur'>;

export function FormTab(props: FormTabProps): VNode {
  const t = props.t;
  const draft = props.draft;
  const isHttp = draft.transport === 'streamable-http';

  function set(patch: Partial<Draft>): void {
    props.onChange({ ...draft, error: null, errorField: null, testResult: null, testError: null, ...patch });
  }

  function field(options: FieldOptions): VNode {
    const id = 'mcps-f' + options.name;
    const messageId = id + '-message';
    // The reserved message row keeps fields stationary when validation changes.
    const message = options.error || options.hint || '';
    const shared: SharedFieldProps = {
      id,
      className: options.multiline ? 'mcps_textarea' : 'mcps_input',
      value: options.value,
      disabled: draft.saving || draft.testing || options.readOnly,
      spellCheck: false,
      placeholder: options.placeholder,
      'aria-required': options.required || undefined,
      'aria-invalid': Boolean(options.error) || undefined,
      'aria-describedby': messageId,
      onChange: options.onChange ?? function (event: ChangeEvent<FieldElement>) {
        set(options.patch(event.currentTarget.value));
      },
      onBlur: options.onBlur,
    };
    return h(
      'div',
      { className: 'mcps_field', key: options.name },
      h('label', { className: 'mcps_label', htmlFor: id }, t(FIELD_LABELS[options.name])),
      options.multiline ? h('textarea', shared) : h('input', { autoComplete: 'off', ...shared }),
      h(
        'p',
        {
          className: 'mcps_fieldMessage' + (options.error ? ' mcps_fieldMessageError' : ''),
          id: messageId,
          title: message === '' ? undefined : message.replace(/`/g, ''),
        },
        message === '' ? '\u00a0' : renderInlineCode(message),
      ),
    );
  }

  function fieldError(name: FieldName): string | null {
    return draft.errorField === name ? draft.error : null;
  }

  const fields: VNode[] = [
    field({
      name: 'name',
      value: draft.name,
      required: true,
      readOnly: draft.mode === 'edit' && !draft.canRename,
      placeholder: t('fieldNamePlaceholder'),
      hint: t('fieldNameHint'),
      error: fieldError('name'),
      patch: (value) => ({ name: value }),
      onChange: function (event) {
        const value = event.currentTarget.value;
        const editable = draft.mode === 'add' || draft.canRename;
        // An empty field is not scolded mid-typing.
        const live = editable && value !== '' ? props.onValidateName(value, draft.originalName) : null;
        props.onChange({ ...draft, name: value, error: live, errorField: live ? 'name' : null });
      },
      onBlur: function (event) {
        if (draft.mode !== 'add' && !draft.canRename) return;
        const trimmed = event.currentTarget.value.trim();
        const message = props.onValidateName(trimmed, draft.originalName);
        props.onChange({ ...draft, name: trimmed, error: message, errorField: message ? 'name' : null });
      },
    }),
    h(
      'div',
      { className: 'mcps_field', key: 'transport' },
      h('span', { className: 'mcps_label' }, t('fieldTransport')),
      h(
        'div',
        { className: 'mcps_tabs', role: 'tablist' },
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            className: 'mcps_tab',
            'data-active': draft.transport === 'stdio' ? 'true' : 'false',
            'aria-selected': draft.transport === 'stdio',
            disabled: draft.saving || draft.testing,
            onClick: () => set({ transport: 'stdio' }),
          },
          t('transportStdio'),
        ),
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            className: 'mcps_tab',
            'data-active': draft.transport === 'streamable-http' ? 'true' : 'false',
            'aria-selected': draft.transport === 'streamable-http',
            disabled: draft.saving || draft.testing,
            onClick: () => set({ transport: 'streamable-http' }),
          },
          t('transportHttp'),
        ),
      ),
    ),
  ];

  if (isHttp) {
    fields.push(
      field({ name: 'url', value: draft.url, required: true, placeholder: t('fieldUrlPlaceholder'), hint: t('fieldUrlHint'), error: fieldError('url'), patch: (value) => ({ url: value }) }),
      field({ name: 'headers', value: draft.headers, multiline: true, placeholder: t('fieldHeadersPlaceholder'), hint: t('fieldHeadersHint'), error: fieldError('headers'), patch: (value) => ({ headers: value }) }),
    );
  } else {
    fields.push(
      field({ name: 'command', value: draft.command, required: true, placeholder: t('fieldCommandPlaceholder'), hint: t('fieldCommandHint'), error: fieldError('command'), patch: (value) => ({ command: value }) }),
      field({ name: 'args', value: draft.args, multiline: true, placeholder: t('fieldArgsPlaceholder'), hint: t('fieldArgsHint'), patch: (value) => ({ args: value }) }),
      field({ name: 'env', value: draft.env, multiline: true, placeholder: t('fieldEnvPlaceholder'), hint: t('fieldEnvHint'), error: fieldError('env'), patch: (value) => ({ env: value }) }),
      field({ name: 'cwd', value: draft.cwd, hint: t('fieldCwdHint'), patch: (value) => ({ cwd: value }) }),
    );
  }

  return h('div', { className: 'mcps_form' }, fields);
}

export interface JsonTabRenderResult {
  body: VNode;
  selectedCount: number;
}

/** Render content and selection metadata for the add dialog's footer. */
export function renderJsonTab(props: JsonTabProps): JsonTabRenderResult {
  const t = props.t;
  const state = props.json;
  const selectedCount = state.rows.filter((row) => row.selected && !row.collision).length;
  const body: VNode[] = [
    h(
      'div',
      { className: 'mcps_field', key: 'text' },
      h('label', { className: 'mcps_label', htmlFor: 'mcps-json' }, t('jsonLabel')),
      h('textarea', {
        id: 'mcps-json',
        className: 'mcps_textarea mcps_json',
        value: state.text,
        spellCheck: false,
        placeholder: state.placeholder,
        disabled: state.parsing || state.importing,
        onChange: function (event: ChangeEvent<HTMLTextAreaElement>) {
          props.onText(event.currentTarget.value);
        },
      }),
      h('p', { className: 'mcps_hint' }, t('jsonHint')),
    ),
  ];

  if (state.error) body.push(h('div', { className: 'mcps_failure', key: 'error', role: 'alert' }, state.error));
  if (state.message) body.push(h('div', { className: 'mcps_hint2', key: 'message' }, state.message));
  if (state.rows.length > 0) {
    body.push(
      h(
        'ul',
        { className: 'mcps_importList', key: 'rows' },
        state.rows.map(function (row) {
          return h(
            'li',
            { className: 'mcps_importRow', key: row.name },
            h('input', {
              type: 'checkbox',
              className: 'mcps_checkbox',
              checked: row.selected && !row.collision,
              disabled: row.collision || state.importing,
              'aria-label': row.name,
              onChange: function (event: ChangeEvent<HTMLInputElement>) {
                props.onSelect(row.name, event.currentTarget.checked);
              },
            }),
            h('span', { className: 'mcps_name' }, row.name),
            row.collision ? h('span', { className: 'mcps_badge' }, t('jsonExists')) : null,
            row.changed ? h('span', { className: 'mcps_hint2' }, interpolate(t('jsonRenamed'), { name: row.name }) + ' (' + row.originalName + ')') : null,
            row.warning === 'sse' ? h('span', { className: 'mcps_hint2' }, t('jsonReasonSse')) : null,
          );
        }),
      ),
    );
    if (state.skipped.length > 0) {
      body.push(
        h(
          'div',
          { className: 'mcps_hint2', key: 'skipped' },
          state.skipped.map(function (item) {
            return h('div', { key: item.name }, interpolate(t('jsonSkipped'), { name: item.name, reason: item.reason === 'entry' ? t('jsonReasonEntry') : t('jsonReasonName') }));
          }),
        ),
      );
    }
  }

  return { body: h('div', { className: 'mcps_form' }, body), selectedCount };
}

/** A normal React component; metadata consumers use renderJsonTab instead. */
export function JsonTab(props: JsonTabProps): VNode {
  return renderJsonTab(props).body;
}
