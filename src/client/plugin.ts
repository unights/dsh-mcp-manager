import { createElement as h } from 'react';
import { NS, SECTION_ID } from './constants.ts';
import { createApi } from './api.ts';
import { Section } from './section.ts';
import { NavIcon } from './components/icons.ts';
import { en } from './locale/en.ts';
import { zh } from './locale/zh.ts';
import { ja } from './locale/ja.ts';
import { es } from './locale/es.ts';
import { fr } from './locale/fr.ts';
import { de } from './locale/de.ts';
import { ru } from './locale/ru.ts';
import { pt } from './locale/pt.ts';
import styleText from './style.css';
import type { ClientContext } from './types.ts';

export const inject: readonly string[] = ['slots', 'locale', 'remote', 'remote.mcpManager', 'remote.settings'];

/** Bind host-provided dependencies once; the bundle keeps React external to the loader. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh, ja, es, fr, de, ru, pt }), 'mcp-servers: dictionaries');
  const t = ctx.locale.bind(NS);
  const api = createApi(ctx);
  const subscribeLocale = (listener: () => void) => ctx.locale.subscribe(listener);
  const BoundSection = () => h(Section, { t, api, subscribeLocale, styleText });
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: SECTION_ID, order: 30, label: () => t('nav') }, BoundSection));
  ctx.slots.inject('settings.section.icon', () => ctx.slots.register(
    { name: 'settings.section.icon', id: SECTION_ID, order: 30, label: () => t('nav') }, NavIcon));
}
