import { describe, expect, it } from 'vitest'
import { WHATSAPP_FORMATS, applyWhatsAppFormat, parseInline, parseWhatsAppMessage, type TextSelection, type WhatsAppFormatId } from './whatsapp-format'

/** Selects the part of `text` between the two | marks. */
function selection(marked: string): TextSelection {
  const start = marked.indexOf('|')
  const end = marked.lastIndexOf('|') - 1
  return { text: marked.replace(/\|/g, ''), start, end: Math.max(start, end) }
}

/** Puts the | marks back, so a result reads as text plus selection. */
function marked(result: TextSelection): string {
  if (result.start === result.end) return `${result.text.slice(0, result.start)}|${result.text.slice(result.start)}`
  return `${result.text.slice(0, result.start)}|${result.text.slice(result.start, result.end)}|${result.text.slice(result.end)}`
}

function apply(text: string, id: WhatsAppFormatId): string {
  return marked(applyWhatsAppFormat(selection(text), id))
}

describe('WHATSAPP_FORMATS', () => {
  // WhatsApp's help article, checked 2026-10-06. A change here means the article changed.
  it('uses the symbols WhatsApp documents', () => {
    expect(WHATSAPP_FORMATS.map((format) => [format.id, format.example])).toEqual([
      ['bold', '*text*'],
      ['italic', '_text_'],
      ['strikethrough', '~text~'],
      ['monospace', '```text```'],
      ['code', '`text`'],
      ['bullets', '- text'],
      ['numbers', '1. text'],
      ['quote', '> text'],
    ])
  })

  it('previews every documented example as the format it names', () => {
    for (const format of WHATSAPP_FORMATS) {
      const [block] = parseWhatsAppMessage(format.example)
      const type = block?.type === 'line' ? block.children[0]?.type : block?.type
      expect(type).toBe(format.id)
    }
  })
})

describe('applyWhatsAppFormat on selected words', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(apply('Sale ends |Friday| at noon', 'bold')).toBe('Sale ends |*Friday*| at noon')
    expect(apply('|was 40|', 'strikethrough')).toBe('|~was 40~|')
    expect(apply('code |AB12|', 'monospace')).toBe('code |```AB12```|')
  })

  it('keeps the symbols tight against the words when spaces were selected too', () => {
    expect(apply('ends| Friday |at', 'italic')).toBe('ends| _Friday_ |at')
  })

  it('removes the symbols when the selection already has them', () => {
    expect(apply('Sale ends |*Friday*|', 'bold')).toBe('Sale ends |Friday|')
  })

  it('wraps each line of a selection that spans lines', () => {
    expect(apply('|one\ntwo|', 'bold')).toBe('|*one*\n*two*|')
  })

  it('leaves a list marker in front of the words it wraps', () => {
    expect(apply('|- apples\n- pears|', 'bold')).toBe('|- *apples*\n- *pears*|')
  })

  it('puts the cursor between the symbols when nothing is selected', () => {
    expect(apply('Hello ||', 'bold')).toBe('Hello *|*')
  })
})

describe('applyWhatsAppFormat on lines', () => {
  it('starts every selected line with a bullet', () => {
    expect(apply('We sell:\n|apples\npears|', 'bullets')).toBe('We sell:\n|- apples\n- pears|')
  })

  it('numbers the lines in order', () => {
    expect(apply('|first\nsecond\nthird|', 'numbers')).toBe('|1. first\n2. second\n3. third|')
  })

  it('works on the whole line when only part of it is selected', () => {
    expect(apply('He said |so|', 'quote')).toBe('|> He said so|')
  })

  it('formats the line the cursor is on when nothing is selected', () => {
    expect(apply('one\ntw||o', 'bullets')).toBe('one\n|- two|')
  })

  it('swaps one kind of list for another', () => {
    expect(apply('|- apples\n- pears|', 'numbers')).toBe('|1. apples\n2. pears|')
  })

  it('removes the markers when every line already has them', () => {
    expect(apply('|1. apples\n2. pears|', 'numbers')).toBe('|apples\npears|')
  })
})

describe('parseInline', () => {
  it('reads the three styles', () => {
    expect(parseInline('a *b* _c_ ~d~')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'strikethrough', children: [{ type: 'text', text: 'd' }] },
    ])
  })

  it('reads one style inside another', () => {
    expect(parseInline('*_both_*')).toEqual([{ type: 'bold', children: [{ type: 'italic', children: [{ type: 'text', text: 'both' }] }] }])
  })

  it('reads inline code and monospace as typed, with no styles inside', () => {
    expect(parseInline('`a*b*` ```c_d_```')).toEqual([
      { type: 'code', text: 'a*b*' },
      { type: 'text', text: ' ' },
      { type: 'monospace', text: 'c_d_' },
    ])
  })

  it('leaves symbols that are not a pair as typed', () => {
    expect(parseInline('2 * 3 = 6')).toEqual([{ type: 'text', text: '2 * 3 = 6' }])
    expect(parseInline('a *b')).toEqual([{ type: 'text', text: 'a *b' }])
    expect(parseInline('* spaced *')).toEqual([{ type: 'text', text: '* spaced *' }])
  })

  it('leaves symbols inside a word alone', () => {
    expect(parseInline('snake_case_name')).toEqual([{ type: 'text', text: 'snake_case_name' }])
  })
})

describe('parseWhatsAppMessage', () => {
  it('groups neighbouring list lines into one list', () => {
    expect(parseWhatsAppMessage('We sell:\n- apples\n* pears\nThanks')).toEqual([
      { type: 'line', children: [{ type: 'text', text: 'We sell:' }] },
      { type: 'bullets', items: [[{ type: 'text', text: 'apples' }], [{ type: 'text', text: 'pears' }]] },
      { type: 'line', children: [{ type: 'text', text: 'Thanks' }] },
    ])
  })

  it('keeps the numbers that were typed', () => {
    expect(parseWhatsAppMessage('3. three\n4. four')).toEqual([
      {
        type: 'numbers',
        items: [
          { marker: '3.', children: [{ type: 'text', text: 'three' }] },
          { marker: '4.', children: [{ type: 'text', text: 'four' }] },
        ],
      },
    ])
  })

  it('reads a quote, with styles inside it', () => {
    expect(parseWhatsAppMessage('> *yes*')).toEqual([{ type: 'quote', children: [{ type: 'bold', children: [{ type: 'text', text: 'yes' }] }] }])
  })

  it('keeps a blank line as a blank line', () => {
    expect(parseWhatsAppMessage('a\n\nb').map((block) => (block.type === 'line' ? block.children.length : -1))).toEqual([1, 0, 1])
  })
})
