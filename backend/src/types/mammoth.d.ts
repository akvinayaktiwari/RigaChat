// mammoth ships no bundled types and no @types/mammoth package exists on npm
// (confirmed via `npm view @types/mammoth` — 404). Declaring only the one
// function this codebase actually calls, not the full API surface.
declare module 'mammoth' {
  interface ExtractRawTextOptions {
    buffer: Buffer
  }

  interface ExtractRawTextResult {
    value: string
    messages: unknown[]
  }

  function extractRawText(options: ExtractRawTextOptions): Promise<ExtractRawTextResult>

  const mammoth: { extractRawText: typeof extractRawText }
  export default mammoth
}
