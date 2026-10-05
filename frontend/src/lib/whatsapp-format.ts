/**
 * WhatsApp's own text formatting, for the free text formatter: adding the
 * symbols to a message, and reading them back to draw a preview.
 *
 * The syntax is WhatsApp's, from its Help Center article "How to format your
 * messages" (https://faq.whatsapp.com/539178204879377), checked 2026-10-06.
 * Every entry in WHATSAPP_FORMATS restates that article and nothing else.
 *
 * The preview is this tool's reading of that syntax. WhatsApp does not publish
 * the exact rules its apps apply (what counts as a word edge, how styles nest),
 * so the page calls the preview a guide and says to check in WhatsApp.
 */

export const WHATSAPP_FORMAT_DOCS = 'https://faq.whatsapp.com/539178204879377'

export type WhatsAppFormatId = 'bold' | 'italic' | 'strikethrough' | 'code' | 'monospace' | 'bullets' | 'numbers' | 'quote'

export interface WhatsAppFormat {
  id: WhatsAppFormatId
  label: string
  /** How WhatsApp's article says to write it. */
  rule: string
  /** A message that uses it, exactly as typed. */
  example: string
  /** Symbols placed on both sides of the text. Absent for formats that start a line instead. */
  wrap?: string
}

export const WHATSAPP_FORMATS: readonly WhatsAppFormat[] = [
  { id: 'bold', label: 'Bold', rule: 'An asterisk on both sides of the text', example: '*text*', wrap: '*' },
  { id: 'italic', label: 'Italic', rule: 'An underscore on both sides of the text', example: '_text_', wrap: '_' },
  { id: 'strikethrough', label: 'Strikethrough', rule: 'A tilde on both sides of the text', example: '~text~', wrap: '~' },
  { id: 'monospace', label: 'Monospace', rule: 'Three backticks on both sides of the text', example: '```text```', wrap: '```' },
  { id: 'code', label: 'Inline code', rule: 'A backtick on both sides of the text', example: '`text`', wrap: '`' },
  { id: 'bullets', label: 'Bulleted list', rule: 'An asterisk or a hyphen, then a space, before each line', example: '- text' },
  { id: 'numbers', label: 'Numbered list', rule: 'A number, a period and a space before each line', example: '1. text' },
  { id: 'quote', label: 'Quote', rule: 'An angle bracket and a space before the text', example: '> text' },
]

/** A message and the part of it that is selected. */
export interface TextSelection {
  text: string
  start: number
  end: number
}

function formatOf(id: WhatsAppFormatId): WhatsAppFormat {
  const format = WHATSAPP_FORMATS.find((entry) => entry.id === id)
  if (!format) throw new Error(`Unknown WhatsApp format: ${id}`)
  return format
}

/**
 * Wraps one piece of text, keeping the symbols tight against the words: spaces
 * at either end stay outside them. Text already wrapped is unwrapped instead,
 * so pressing a button twice undoes it.
 */
function wrapPiece(piece: string, wrap: string): string {
  const core = piece.trim()
  if (!core) return piece
  const lead = piece.slice(0, piece.indexOf(core))
  const tail = piece.slice(lead.length + core.length)
  const wrapped = core.length > wrap.length * 2 && core.startsWith(wrap) && core.endsWith(wrap)
  return `${lead}${wrapped ? core.slice(wrap.length, -wrap.length) : `${wrap}${core}${wrap}`}${tail}`
}

/** With nothing selected, the symbols go in at the cursor with the cursor left between them. */
function insertEmptyWrap(selection: TextSelection, wrap: string): TextSelection {
  const text = `${selection.text.slice(0, selection.start)}${wrap}${wrap}${selection.text.slice(selection.end)}`
  const cursor = selection.start + wrap.length
  return { text, start: cursor, end: cursor }
}

const LINE_MARKER = /^(?:[-*] |\d+\. |> )/

/** Wraps a line's words and leaves its list or quote marker in front, where WhatsApp looks for it. */
function wrapLine(line: string, wrap: string): string {
  const marker = LINE_MARKER.exec(line)?.[0] ?? ''
  return `${marker}${wrapPiece(line.slice(marker.length), wrap)}`
}

function wrapSelection(selection: TextSelection, wrap: string): TextSelection {
  if (selection.start === selection.end) return insertEmptyWrap(selection, wrap)
  const picked = selection.text.slice(selection.start, selection.end)
  // Each line is wrapped by itself, so a style never has to cross a line break.
  const replaced = picked.split('\n').map((line) => wrapLine(line, wrap)).join('\n')
  const text = `${selection.text.slice(0, selection.start)}${replaced}${selection.text.slice(selection.end)}`
  return { text, start: selection.start, end: selection.start + replaced.length }
}

function prefixFor(id: WhatsAppFormatId, index: number): string {
  if (id === 'numbers') return `${index + 1}. `
  return id === 'quote' ? '> ' : '- '
}

function hasPrefix(id: WhatsAppFormatId, line: string): boolean {
  if (id === 'numbers') return /^\d+\. /.test(line)
  return id === 'quote' ? line.startsWith('> ') : /^[-*] /.test(line)
}

/**
 * Starts every selected line with the format's marker, replacing any marker a
 * line already has. When every line already carries this one, they are removed
 * instead. The selection grows to whole lines, since a marker belongs to a line.
 */
function prefixLines(selection: TextSelection, id: WhatsAppFormatId): TextSelection {
  const start = selection.text.lastIndexOf('\n', selection.start - 1) + 1
  const nextBreak = selection.text.indexOf('\n', selection.end)
  const end = nextBreak === -1 ? selection.text.length : nextBreak
  const lines = selection.text.slice(start, end).split('\n')
  const remove = lines.every((line) => hasPrefix(id, line))
  const replaced = lines.map((line, index) => `${remove ? '' : prefixFor(id, index)}${line.replace(LINE_MARKER, '')}`).join('\n')
  return { text: `${selection.text.slice(0, start)}${replaced}${selection.text.slice(end)}`, start, end: start + replaced.length }
}

/** Applies a format to the selected part of a message, and says what should be selected afterwards. */
export function applyWhatsAppFormat(selection: TextSelection, id: WhatsAppFormatId): TextSelection {
  const { wrap } = formatOf(id)
  return wrap ? wrapSelection(selection, wrap) : prefixLines(selection, id)
}

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'monospace'; text: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'strikethrough'; children: InlineNode[] }

export type MessageBlock =
  | { type: 'line'; children: InlineNode[] }
  | { type: 'bullets'; items: InlineNode[][] }
  | { type: 'numbers'; items: { marker: string; children: InlineNode[] }[] }
  | { type: 'quote'; children: InlineNode[] }

const STYLE_BY_MARKER: Record<string, 'bold' | 'italic' | 'strikethrough'> = { '*': 'bold', _: 'italic', '~': 'strikethrough' }

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character)
}

function isSpace(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character)
}

/** Where the span opened at `open` closes, or -1 when it does not. The symbols must hug the text and sit at word edges. */
function closingIndex(line: string, open: number, marker: string): number {
  if (isWordCharacter(line[open - 1]) || isSpace(line[open + 1])) return -1
  for (let index = open + 2; index < line.length; index++) {
    if (line[index] === marker && !isSpace(line[index - 1]) && !isWordCharacter(line[index + 1])) return index
  }
  return -1
}

/** The node starting at `index` and where it ends, or null when the character there is plain text. */
function nodeAt(line: string, index: number): { node: InlineNode; end: number } | null {
  if (line.startsWith('```', index)) {
    const close = line.indexOf('```', index + 3)
    return close > index + 3 ? { node: { type: 'monospace', text: line.slice(index + 3, close) }, end: close + 3 } : null
  }
  if (line[index] === '`') {
    const close = line.indexOf('`', index + 1)
    return close > index + 1 ? { node: { type: 'code', text: line.slice(index + 1, close) }, end: close + 1 } : null
  }
  const style = STYLE_BY_MARKER[line[index] ?? '']
  if (!style) return null
  const close = closingIndex(line, index, line[index] ?? '')
  return close === -1 ? null : { node: { type: style, children: parseInline(line.slice(index + 1, close)) }, end: close + 1 }
}

/** One line of a message as styled pieces. Symbols that do not form a pair stay as typed. */
export function parseInline(line: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let plain = ''
  let index = 0
  while (index < line.length) {
    const found = nodeAt(line, index)
    if (!found) {
      plain += line[index]
      index += 1
      continue
    }
    if (plain) nodes.push({ type: 'text', text: plain })
    plain = ''
    nodes.push(found.node)
    index = found.end
  }
  if (plain) nodes.push({ type: 'text', text: plain })
  return nodes
}

function appendListItem(blocks: MessageBlock[], line: string): boolean {
  const last = blocks[blocks.length - 1]
  const bullet = /^[-*] (.*)$/.exec(line)
  if (bullet) {
    const item = parseInline(bullet[1] ?? '')
    if (last?.type === 'bullets') last.items.push(item)
    else blocks.push({ type: 'bullets', items: [item] })
    return true
  }
  const numbered = /^(\d+\.) (.*)$/.exec(line)
  if (!numbered) return false
  const item = { marker: numbered[1] ?? '', children: parseInline(numbered[2] ?? '') }
  if (last?.type === 'numbers') last.items.push(item)
  else blocks.push({ type: 'numbers', items: [item] })
  return true
}

/** A whole message as blocks: lines, lists and quotes, in the order they were typed. */
export function parseWhatsAppMessage(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = []
  for (const line of text.split('\n')) {
    if (appendListItem(blocks, line)) continue
    if (line.startsWith('> ')) blocks.push({ type: 'quote', children: parseInline(line.slice(2)) })
    else blocks.push({ type: 'line', children: parseInline(line) })
  }
  return blocks
}
