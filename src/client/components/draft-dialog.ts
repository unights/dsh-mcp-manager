import { createElement as h } from 'react';
import { interpolate, testStatusOf } from '../model.ts';
import { FormTab, renderJsonTab } from './fields.ts';
import { Modal, ModeSwitch } from './primitives.ts';
import type { DraftEditor } from '../hooks/draft-editor.ts';
import type { Translate, VNode } from '../types.ts';

/** Compose the editor's controls; all asynchronous state belongs to useDraftEditor. */
export function DraftDialog({ editor, t }: { editor: DraftEditor; t: Translate }): VNode {
  const { draft, jsonState } = editor;
  if (!draft) return null;
  const jsonTab = draft.tab === 'json' && jsonState ? renderJsonTab({ t, json: jsonState,
    onText: editor.changeJsonText, onSelect: editor.selectJsonRow }) : null;
  const busy = draft.saving || draft.testing || Boolean(jsonState?.importing);
  const committing = draft.saving || Boolean(jsonState?.importing);
  const modeSwitch = draft.mode === 'add' ? h(ModeSwitch, { t, tab: draft.tab, busy,
    onSelect: tab => editor.setDraft({ ...draft, tab }) }) : null;
  const footer = [];
  if (jsonTab && jsonState) {
    footer.push(h('span', { key: 'grow', className: 'mcps_grow' }),
      h('button', { key: 'cancel', type: 'button', className: 'mcps_button', disabled: committing, onClick: editor.closeDraft }, t('cancel')),
      h('button', { key: 'import', type: 'button', className: 'mcps_button mcps_primary',
        disabled: committing || jsonTab.selectedCount === 0, onClick: editor.importJson }, jsonState.importing ? t('jsonImporting') : t('jsonImport')));
  } else {
    footer.push(h('button', { key: 'test', type: 'button', className: 'mcps_button', disabled: busy,
      onClick: editor.testDraft }, draft.testing ? t('testing') : t('testConnection')));
    const status = testStatusOf(t, draft);
    if (status) footer.push(h('span', { key: 'status', className: 'mcps_testStatus' + (status.tone === 'error' ? ' mcps_failure' : ''), role: 'status' }, status.text));
    footer.push(h('span', { key: 'grow', className: 'mcps_grow' }),
      h('button', { key: 'cancel', type: 'button', className: 'mcps_button', disabled: committing, onClick: editor.closeDraft }, t('cancel')),
      h('button', { key: 'save', type: 'button', className: 'mcps_button mcps_primary', disabled: busy,
        onClick: editor.saveDraft }, draft.saving ? t('saving') : t('save')));
  }
  return h(Modal, { t, title: draft.mode === 'edit' ? interpolate(t('editTitle'), { name: draft.name }) : t('addTitle'),
    titleId: 'mcps-draft-title', onClose: () => { if (!committing) editor.closeDraft(); }, footer, headerExtra: modeSwitch },
    jsonTab ? jsonTab.body : h(FormTab, { t, draft, onChange: editor.setDraft, onValidateName: editor.validateName }));
}
