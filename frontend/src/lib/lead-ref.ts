import type { LeadRef } from '../types/index'

// A lead's detail URL has to carry its whole LeadRef, not just the leadId: the
// lead tables have different partition keys, so `leadId` alone is
// not addressable. The old route took `?botId=` and therefore could only ever
// open a chat lead — form and Meta leads had their own separate pages.
//
// Serialized as query params rather than path segments so an existing
// /dashboard/leads/:leadId?botId=... link (bookmarked, or in an old email)
// still resolves — see parseLeadRef's chat fallback.

// For the DETAIL PATH only: leadId is deliberately absent because
// leadDetailPath below puts it in the path segment, and repeating it in the
// query would be two sources of truth for the same value in one URL.
//
// Do NOT reach for this when calling an API. Every /api/leads/* endpoint takes
// the whole ref in query params, leadId included, and parses it with a
// validator that returns null without one -- a 400 that reads as "a valid
// leadRef is required" rather than "you forgot leadId". Use leadRefToQuery.
export function leadRefToSearch(ref: LeadRef): string {
  const params = new URLSearchParams({ source: ref.source })
  if (ref.source === 'chat') params.set('botId', ref.botId)
  if (ref.source === 'form') params.set('formId', ref.formId)
  if (ref.source === 'meta') params.set('pageId', ref.pageId)
  if (ref.source === 'voice') params.set('agentId', ref.agentId)
  return params.toString()
}

// For API CALLS: the complete ref, leadId included. The two functions exist
// separately because their one difference is invisible at the call site --
// /api/leads/events shipped using the path-shaped one and returned 400 for
// every lead, which no type could have caught since both return a string.
export function leadRefToQuery(ref: LeadRef): string {
  const params = new URLSearchParams({ source: ref.source, leadId: ref.leadId })
  if (ref.source === 'chat') params.set('botId', ref.botId)
  if (ref.source === 'form') params.set('formId', ref.formId)
  if (ref.source === 'meta') params.set('pageId', ref.pageId)
  if (ref.source === 'voice') params.set('agentId', ref.agentId)
  return params.toString()
}

export function leadDetailPath(ref: LeadRef): string {
  return `/dashboard/leads/${ref.leadId}?${leadRefToSearch(ref)}`
}

export function parseLeadRef(leadId: string | undefined, params: URLSearchParams): LeadRef | null {
  if (!leadId) return null

  const source = params.get('source')
  const botId = params.get('botId')
  const formId = params.get('formId')
  const pageId = params.get('pageId')
  const agentId = params.get('agentId')

  if (source === 'form' && formId) return { source, formId, leadId }
  if (source === 'meta' && pageId) return { source, pageId, leadId }
  if (source === 'voice' && agentId) return { source, agentId, leadId }
  if (source === 'chat' && botId) return { source, botId, leadId }

  // No `source` but a botId: a link minted before the inbox existed. Treated as
  // a chat lead, which is the only thing it could have been.
  if (!source && botId) return { source: 'chat', botId, leadId }

  return null
}

// ---------------------------------------------------------------------------
// Packed single-segment form, for the /l/:token route.
//
// A WhatsApp URL button can only carry its variable as a trailing path suffix,
// which the query-string form above cannot satisfy. backend/src/lib/lead-link.ts
// packs the ref; this unpacks it. The two are mirrors and must stay in step --
// the same test vectors are asserted on both sides.
//
// This is the only lead URL form that is NOT human-readable, which is the
// trade: the token sits behind a button label, so its opacity costs nothing and
// buys a deep link where there could otherwise only be an "Open inbox" button.

const PACKED_DELIMITER = '|'

export function packLeadRef(ref: LeadRef): string {
  const scopeId =
    ref.source === 'chat'
      ? ref.botId
      : ref.source === 'form'
        ? ref.formId
        : ref.source === 'voice'
          ? ref.agentId
          : ref.pageId
  const packed = [ref.source, scopeId, ref.leadId].join(PACKED_DELIMITER)
  const bytes = new TextEncoder().encode(packed)
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Null for anything malformed rather than a throw: this parses a token that
// arrived from a link in a WhatsApp message, where truncation and hand-editing
// are ordinary inputs. The route renders "link is not valid" on null.
export function unpackLeadRef(token: string): LeadRef | null {
  // atob throws on a character outside the alphabet, so screen first rather
  // than relying on the try/catch to classify a bad token.
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) return null

  const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)

  let decoded: string
  try {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    decoded = new TextDecoder().decode(bytes)
  } catch {
    return null
  }

  const parts = decoded.split(PACKED_DELIMITER)
  if (parts.length !== 3) return null

  const [source, scopeId, leadId] = parts
  if (!scopeId || !leadId) return null

  if (source === 'chat') return { source, botId: scopeId, leadId }
  if (source === 'form') return { source, formId: scopeId, leadId }
  if (source === 'meta') return { source, pageId: scopeId, leadId }
  if (source === 'voice') return { source, agentId: scopeId, leadId }

  return null
}
