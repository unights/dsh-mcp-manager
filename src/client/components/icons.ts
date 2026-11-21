import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import type { IconButtonOptions, VNode } from '../types.ts';

/** Stroke glyphs shared by every icon-only control in the page. */
export function Glyph(props: { size?: number; children?: ReactNode }): VNode {
  return h(
    'svg',
    {
      viewBox: '0 0 16 16',
      width: props.size ?? 16,
      height: props.size ?? 16,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: 'false',
    },
    props.children,
  );
}

export function IconChevron(): VNode {
  return h(Glyph, null, h('path', { d: 'M6 3.5 10.5 8 6 12.5' }));
}

export function IconEdit(): VNode {
  return h(
    Glyph,
    null,
    h('path', { d: 'M10.5 2.5 13.5 5.5 6 13H3v-3z' }),
    h('path', { d: 'M9 4 12 7' }),
  );
}

export function IconRestart(): VNode {
  return h(
    Glyph,
    null,
    h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.7-3.85' }),
    h('path', { d: 'M13.4 2.6v3.2h-3.2' }),
  );
}

export function IconExport(): VNode {
  return h(
    Glyph,
    null,
    h('path', { d: 'M8 2.2v7.4' }),
    h('path', { d: 'M5.2 5 8 2.2 10.8 5' }),
    h('path', { d: 'M3 10.4v2.6h10v-2.6' }),
  );
}

export function IconDelete(): VNode {
  return h(
    Glyph,
    null,
    h('path', { d: 'M3.2 4.4h9.6' }),
    h('path', { d: 'M6.2 4.4V2.9h3.6v1.5' }),
    h('path', { d: 'M4.7 4.4 5.3 13h5.4l.6-8.6' }),
  );
}

/** One icon-only action; its accessible name doubles as the tooltip. */
export function iconButton(options: IconButtonOptions): VNode {
  const Icon = options.icon;
  return h(
    'button',
    {
      key: options.key,
      type: 'button',
      className: 'mcps_iconButton' + (options.danger ? ' mcps_iconDanger' : ''),
      'aria-label': options.label,
      title: options.title ?? options.label,
      disabled: options.disabled === true,
      onClick: options.onClick,
    },
    h(Icon, null),
  );
}

export function IconPlus(): VNode {
  return h(Glyph, null, h('path', { d: 'M8 3.4v9.2' }), h('path', { d: 'M3.4 8h9.2' }));
}

export function IconClose(): VNode {
  return h(Glyph, null, h('path', { d: 'M4 4l8 8' }), h('path', { d: 'M12 4l-8 8' }));
}

export function NavIcon(): VNode {
  return h(
    'svg',
    { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true, focusable: 'false' },
    h('rect', { x: 1.6, y: 2.4, width: 12.8, height: 4.2, rx: 1.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('rect', { x: 1.6, y: 9.4, width: 12.8, height: 4.2, rx: 1.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
    h('circle', { cx: 4.3, cy: 4.5, r: 0.85, fill: 'currentColor' }),
    h('circle', { cx: 4.3, cy: 11.5, r: 0.85, fill: 'currentColor' }),
  );
}
