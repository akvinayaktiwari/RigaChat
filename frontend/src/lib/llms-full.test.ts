import { describe, expect, it } from 'vitest'
import { buildLlmsFullTxt, extractContent, htmlToText, pageTitle } from './llms-full'

const POST = `<html><head><title>What is a CRM chatbot? &amp; why | Vyostra AI</title></head><body>
<nav><a href="/">Home</a></nav>
<article><h1>What is a CRM chatbot?</h1><p>It answers <strong>enquiries</strong> and saves leads.</p>
<script>window.x = 1</script><h2>Limits</h2><ul><li>No voice</li><li>No email</li></ul></article>
<footer>Footer text</footer></body></html>`

describe('extractContent', () => {
  it('prefers the article and leaves navigation and footer out', () => {
    const content = extractContent(POST)
    expect(content).toContain('What is a CRM chatbot?')
    expect(content).not.toContain('Footer text')
  })

  it('falls back to main, and returns null when there is neither', () => {
    expect(extractContent('<main><p>x</p></main>')).toBe('<main><p>x</p></main>')
    expect(extractContent('<div>no landmark</div>')).toBeNull()
  })
})

describe('htmlToText', () => {
  it('turns headings and list items into markdown and drops scripts', () => {
    const text = htmlToText(extractContent(POST) ?? '')
    expect(text).toContain('## What is a CRM chatbot?')
    expect(text).toContain('### Limits')
    expect(text).toContain('- No voice\n- No email')
    expect(text).toContain('It answers enquiries and saves leads.')
    expect(text).not.toContain('window.x')
  })

  it('decodes entities', () => {
    expect(htmlToText('<p>Fish &amp; chips &mdash; &#8364;5</p>')).toBe('Fish & chips — €5')
  })
})

describe('pageTitle', () => {
  it('reads and decodes the document title', () => {
    expect(pageTitle(POST)).toBe('What is a CRM chatbot? & why | Vyostra AI')
  })
})

describe('buildLlmsFullTxt', () => {
  const pages = [
    { url: 'https://vyostra.com/blog/crm/', html: POST },
    { url: 'https://vyostra.com/', html: '<html><head><title>Home</title></head><body><div>no landmark</div></body></html>' },
  ]
  const out = buildLlmsFullTxt({ origin: 'https://vyostra.com', definition: 'Vyostra AI is a chatbot.', pages })

  it('names each included page with its source URL', () => {
    expect(out).toContain('Source: https://vyostra.com/blog/crm/')
    expect(out).toContain('> Vyostra AI is a chatbot.')
  })

  it('skips a page that has no content landmark instead of dumping its chrome', () => {
    expect(out).not.toContain('Source: https://vyostra.com/\n')
    expect(out).not.toContain('no landmark')
  })
})
