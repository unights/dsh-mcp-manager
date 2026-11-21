import { createElement as h, useEffect, useRef } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { ModalProps, ModeSwitchProps, VNode } from '../types.ts';
import { IconClose } from './icons.ts';

/** Stable hue per server name: one server keeps one monogram colour. */
export function avatarStyle(name: string): CSSProperties {
  let hue = 0;
  for (let index = 0; index < name.length; index += 1) {
    hue = (hue * 31 + name.charCodeAt(index)) % 360;
  }
  return { background: 'hsl(' + String(hue) + ' 42% 46%)', color: '#ffffff' };
}

/** Render backtick-wrapped helper fragments as inline code. */
export function renderInlineCode(text: string): ReactNode[] {
  return text.split('`').map(function (part, index) {
    if (index % 2 === 0) return part;
    return h('code', { className: 'mcps_code', key: 'code' + String(index) }, part);
  });
}

const FOCUSABLE_SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** A real dialog: scrim, Escape, focus trap, and focus restore. */
export function Modal(props: ModalProps): VNode {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;

  useEffect(function () {
    if (typeof document === 'undefined') return;
    const opener = document.activeElement;
    const node = dialog.current;
    const initial = node?.querySelector<HTMLElement>('input:not([disabled]):not([type="checkbox"]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])');
    (initial ?? node)?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const list = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(function (element) {
        return element.offsetParent !== null || element === document.activeElement;
      });
      const firstElement = list[0];
      const lastElement = list[list.length - 1];
      if (!firstElement || !lastElement) {
        event.preventDefault();
        node.focus();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === firstElement || !node.contains(active))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (active === lastElement || !node.contains(active))) {
        event.preventDefault();
        firstElement.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return function () {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return h(
    'div',
    {
      className: 'mcps_overlay',
      onMouseDown: function (event: MouseEvent<HTMLDivElement>) {
        if (event.target === event.currentTarget) props.onClose();
      },
    },
    h('div', { className: 'mcps_scrim', 'aria-hidden': 'true', onMouseDown: props.onClose }),
    h(
      'div',
      {
        className: 'mcps_dialog' + (props.dialogClassName ? ' ' + props.dialogClassName : ''),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': props.titleId,
        tabIndex: -1,
        ref: dialog,
      },
      h(
        'div',
        { className: 'mcps_dialogHead' },
        h('h2', { className: 'mcps_dialogTitle', id: props.titleId }, props.title),
        h('span', { className: 'mcps_grow' }),
        props.headerExtra ?? null,
        h(
          'button',
          {
            type: 'button',
            className: 'mcps_iconButton',
            'aria-label': props.t('close'),
            title: props.t('close'),
            onClick: props.onClose,
          },
          h(IconClose, null),
        ),
      ),
      props.children,
      props.footer ? h('div', { className: 'mcps_footer' }, props.footer) : null,
    ),
  );
}

/** Segmented switch between the form and the JSON input. */
export function ModeSwitch(props: ModeSwitchProps): VNode {
  function segment(tab: ModeSwitchProps['tab'], label: string): VNode {
    return h(
      'button',
      {
        type: 'button',
        className: 'mcps_segment',
        'aria-pressed': props.tab === tab,
        disabled: props.busy,
        onClick: function () {
          if (props.tab !== tab) props.onSelect(tab);
        },
      },
      label,
    );
  }
  return h(
    'div',
    { className: 'mcps_segmented', role: 'group' },
    segment('form', props.t('tabForm')),
    segment('json', props.t('tabJson')),
  );
}
