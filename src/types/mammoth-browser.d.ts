// mammoth ships no published TypeScript types (no @types/mammoth package exists).
// Minimal surface for the browser build entry point used by the document viewer.
declare module "mammoth/mammoth.browser" {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
