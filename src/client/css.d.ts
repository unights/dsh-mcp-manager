// css.d.ts — the stylesheet is a build input; this keeps the import type-checkable.

declare module '*.css' {
  const stylesheet: string;
  export default stylesheet;
}
