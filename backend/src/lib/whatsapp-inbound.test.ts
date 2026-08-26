import { describe, expect, it } from 'vitest'
import { extractGupshupInboundText, extractMetaInboundText } from './whatsapp-inbound.js'
import { WHATSAPP_TEMPLATES, validateAllTemplates, validateTemplate } from './whatsapp-templates.js'

describe('extractMetaInboundText', () => {
  it('reads a typed text message', () => {
    expect(extractMetaInboundText({ type: 'text', text: { body: '  Hello there  ' } })).toEqual({
      text: 'Hello there',
      kind: 'text',
    })
  })

  // THE regression test. A template quick-reply tap carries its label in
  // button.text, not text.body. Reading only text.body turned a real answer
  // into an empty string: the agent was asked to respond to "" and the journey
  // resumed on nothing.
  it('reads a template quick-reply tap', () => {
    expect(
      extractMetaInboundText({
        type: 'button',
        button: { text: 'Yes, this weekend', payload: 'weekend_yes' },
      })
    ).toEqual({ text: 'Yes, this weekend', kind: 'button' })
  })

  it('reads an interactive button reply', () => {
    expect(
      extractMetaInboundText({
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Under 50L' } },
      })
    ).toEqual({ text: 'Under 50L', kind: 'interactive' })
  })

  it('reads an interactive list reply', () => {
    expect(
      extractMetaInboundText({
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'l1', title: 'Wakad', description: 'Pune west' } },
      })
    ).toEqual({ text: 'Wakad', kind: 'interactive' })
  })

  // The label is what the lead believes they said. A payload is an internal id
  // and putting it in a transcript makes the transcript a lie.
  it('prefers the visible label over the payload', () => {
    const result = extractMetaInboundText({
      type: 'button',
      button: { text: 'Not right now', payload: 'NUDGE_DECLINE_V2' },
    })
    expect(result.text).toBe('Not right now')
  })

  it.each([
    ['a reaction', { type: 'reaction' }],
    ['a sticker', { type: 'sticker' }],
    ['an unsupported type', { type: 'unsupported' }],
    ['an empty text body', { type: 'text', text: { body: '   ' } }],
    ['a button with no label', { type: 'button', button: { payload: 'x' } }],
  ])('returns unsupported for %s', (_label, message) => {
    expect(extractMetaInboundText(message)).toEqual({ text: '', kind: 'unsupported' })
  })
})

describe('extractGupshupInboundText', () => {
  it('reads typed text', () => {
    expect(extractGupshupInboundText({ type: 'text', text: 'Hello' })).toEqual({ text: 'Hello', kind: 'text' })
  })

  it('reads a button reply from its title', () => {
    expect(extractGupshupInboundText({ type: 'button_reply', title: 'Confirm' })).toEqual({
      text: 'Confirm',
      kind: 'button',
    })
  })

  it('falls back to postbackText when a button carries no title', () => {
    expect(extractGupshupInboundText({ type: 'button_reply', postbackText: 'CONFIRM' })).toEqual({
      text: 'CONFIRM',
      kind: 'button',
    })
  })

  it('returns unsupported for a wordless payload', () => {
    expect(extractGupshupInboundText({ type: 'image' })).toEqual({ text: '', kind: 'unsupported' })
  })
})

describe('template registry validity', () => {
  // Meta rejections cost a 24-48h round trip, so every rule that can be checked
  // locally is checked here rather than discovered at review.
  it('every shipped template satisfies Meta\'s rules', () => {
    expect(validateAllTemplates()).toEqual([])
  })

  // Both directions, because Meta rejects each one and names neither the button
  // nor the reason: a {{1}} url with no example, and an example on a static url.
  it('catches a dynamic URL button with no example', () => {
    const problems = validateTemplate({
      name: 'test_dynamic_no_example',
      category: 'UTILITY',
      body: 'Open it.',
      bodyExample: [],
      buttons: [{ type: 'URL', text: 'Open', url: 'https://vyostra.com/l/{{1}}' }],
      sentBy: 'test',
    })

    expect(problems).toContain('test_dynamic_no_example: dynamic URL button "Open" has no urlExample')
  })

  it('catches an example on a static URL button', () => {
    const problems = validateTemplate({
      name: 'test_static_with_example',
      category: 'UTILITY',
      body: 'Open it.',
      bodyExample: [],
      buttons: [
        {
          type: 'URL',
          text: 'Open',
          url: 'https://vyostra.com/dashboard/leads',
          urlExample: 'https://vyostra.com/dashboard/leads',
        },
      ],
      sentBy: 'test',
    })

    expect(problems).toContain('test_static_with_example: static URL button "Open" must not carry a urlExample')
  })

  // Accepted at create time and then wrong on every send, which is the worst
  // shape of failure available here.
  it('catches a URL variable that is not the trailing suffix', () => {
    const problems = validateTemplate({
      name: 'test_midstring_variable',
      category: 'UTILITY',
      body: 'Open it.',
      bodyExample: [],
      buttons: [
        { type: 'URL', text: 'Open', url: 'https://vyostra.com/l/{{1}}/detail', urlExample: 'https://x.com/l/a/detail' },
      ],
      sentBy: 'test',
    })

    expect(problems.some((problem) => problem.includes('must end in {{1}}'))).toBe(true)
  })

  it('every template names what sends it', () => {
    for (const template of WHATSAPP_TEMPLATES) {
      expect(template.sentBy.length).toBeGreaterThan(0)
    }
  })

  it('catches too many quick replies', () => {
    const problems = validateTemplate({
      name: 't',
      category: 'UTILITY',
      body: 'Pick one please.',
      bodyExample: [],
      buttons: [
        { type: 'QUICK_REPLY', text: 'a' },
        { type: 'QUICK_REPLY', text: 'b' },
        { type: 'QUICK_REPLY', text: 'c' },
        { type: 'QUICK_REPLY', text: 'd' },
      ],
      sentBy: 'test',
    })
    expect(problems[0]).toContain('max is 3')
  })

  it('catches an over-long button label', () => {
    const problems = validateTemplate({
      name: 't',
      category: 'UTILITY',
      body: 'Pick one please.',
      bodyExample: [],
      buttons: [{ type: 'QUICK_REPLY', text: 'This label is far too long for Meta' }],
      sentBy: 'test',
    })
    expect(problems[0]).toContain('max is 20')
  })

  it('catches interleaved quick replies and CTAs', () => {
    const problems = validateTemplate({
      name: 't',
      category: 'UTILITY',
      body: 'Pick one please.',
      bodyExample: [],
      buttons: [
        { type: 'QUICK_REPLY', text: 'a' },
        { type: 'URL', text: 'site', url: 'https://x.com' },
        { type: 'QUICK_REPLY', text: 'b' },
      ],
      sentBy: 'test',
    })
    expect(problems.some((p) => p.includes('grouped'))).toBe(true)
  })

  it('catches a body ending in a variable', () => {
    const problems = validateTemplate({
      name: 't',
      category: 'UTILITY',
      body: 'Your visit is at {{1}}',
      bodyExample: ['11am'],
      sentBy: 'test',
    })
    expect(problems.some((p) => p.includes('starts or ends with a variable'))).toBe(true)
  })

  it('catches a placeholder with no example value', () => {
    const problems = validateTemplate({
      name: 't',
      category: 'UTILITY',
      body: 'Hi {{1}}, welcome aboard.',
      bodyExample: [],
      sentBy: 'test',
    })
    expect(problems.some((p) => p.includes('example value'))).toBe(true)
  })
})
