/**
 * The free tools, in the order the hub and the footer list them.
 *
 * One list on purpose: the hub page, the footer column, the sitemap and
 * llms.txt all read it, so a tool that ships cannot be missing from one of
 * them. Adding a tool means adding it here, its route in App.tsx, and its page.
 */

export interface FreeTool {
  /** Path as the router matches it, without a trailing slash. */
  route: string
  name: string
  /** One sentence on what it does, for the hub card, the sitemap and llms.txt. */
  summary: string
  /** What the hub card's link says. */
  action: string
  /** ISO date the page last changed in a way a reader would notice. */
  lastModified: string
}

export const TOOLS_HUB = {
  route: '/tools',
  name: 'Free tools',
  summary: 'Free WhatsApp and real estate tools from Vyostra AI that run in your browser, with no sign-up.',
  lastModified: '2026-10-06',
}

export const FREE_TOOLS: readonly FreeTool[] = [
  {
    route: '/tools/whatsapp-qr-code-generator',
    name: 'WhatsApp QR Code Generator',
    summary: 'A free tool that turns a WhatsApp number and an optional pre-filled message into a QR code, saved as PNG or SVG, in the browser.',
    action: 'Make a QR code',
    lastModified: '2026-10-06',
  },
  {
    route: '/tools/whatsapp-text-formatter',
    name: 'WhatsApp Text Formatter',
    summary: 'A free tool that adds WhatsApp formatting to a message (bold, italic, strikethrough, monospace, lists and quotes) with a preview, in the browser.',
    action: 'Format a message',
    lastModified: '2026-10-06',
  },
  {
    route: '/tools/whatsapp-fonts',
    name: 'WhatsApp Fonts',
    summary: 'A free tool that turns text into 16 look-alike font styles to copy into WhatsApp, with a plain account of their limits, in the browser.',
    action: 'Style some text',
    lastModified: '2026-10-06',
  },
  {
    route: '/tools/real-estate-commission-calculator',
    name: 'Real Estate Commission Calculator',
    summary: 'A free calculator that turns a sale price, commission, side split, referral fee, brokerage split and tax into an itemised take-home figure, in the browser.',
    action: 'Calculate commission',
    lastModified: '2026-10-06',
  },
  {
    route: '/tools/open-house-sign-in-sheet',
    name: 'Open House Sign-In Sheet',
    summary: 'A free printable sign-in sheet with your name, address, logo and chosen columns, and an optional QR code that opens your WhatsApp, made in the browser.',
    action: 'Make a sheet',
    lastModified: '2026-10-06',
  },
  {
    route: '/whatsapp-link-generator',
    name: 'WhatsApp Link Generator',
    summary: 'A free tool that builds a wa.me click-to-chat link with a pre-filled message, in the browser.',
    action: 'Build a link',
    lastModified: '2026-10-06',
  },
]

/** The path a page is served at: prerendered routes end in a slash. */
export function servedPath(route: string): string {
  return `${route}/`
}
