import { describe, expect, it } from 'vitest'
import { auditInternalLinks, findSlashlessLinks } from './internal-links'

const ROUTES = new Set(['/blog', '/blog/a-post', '/glossary', '/tools/whatsapp-fonts'])

describe('findSlashlessLinks', () => {
  it('flags a link to a prerendered route without its trailing slash', () => {
    expect(findSlashlessLinks('<a href="/blog">Blog</a>', ROUTES)).toEqual(['/blog'])
  })

  it('accepts the trailing-slash form', () => {
    expect(findSlashlessLinks('<a href="/blog/">Blog</a><a href="/blog/a-post/">x</a>', ROUTES)).toEqual([])
  })

  it('flags a slashless route carrying a fragment or query', () => {
    expect(findSlashlessLinks('<a href="/glossary#crm">x</a><a href="/blog?m=in">y</a>', ROUTES)).toEqual([
      '/glossary#crm',
      '/blog?m=in',
    ])
  })

  it('ignores the homepage, app routes, assets and external links', () => {
    const html = '<a href="/">h</a><a href="/signup">s</a><link href="/assets/x.css"><a href="https://vyostra.com/blog">e</a>'
    expect(findSlashlessLinks(html, ROUTES)).toEqual([])
  })
})

describe('auditInternalLinks', () => {
  it('names each offending href once per page, against the routes being rendered', () => {
    const pages = [
      { route: '/blog', html: '<a href="/tools/whatsapp-fonts">a</a><a href="/tools/whatsapp-fonts">b</a>' },
      { route: '/tools/whatsapp-fonts', html: '<a href="/blog/">ok</a>' },
    ]
    expect(auditInternalLinks(pages)).toEqual([{ page: '/blog', href: '/tools/whatsapp-fonts' }])
  })
})
