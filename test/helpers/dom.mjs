import { JSDOM } from 'jsdom';

// Install the DOM before React Testing Library is imported. Components and hooks
// still run through real React renderers; only the browser environment is supplied.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
