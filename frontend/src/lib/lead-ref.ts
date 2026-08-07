import type { LeadRef } from '../types/index'

// A lead's detail URL has to carry its whole LeadRef, not just the leadId: the
// three lead tables have three different partition keys, so `leadId` alone is
// not addressable. The old route took `?botId=` and therefore could only ever
// open a chat lead — form and Meta leads had their own separate pages.
//
// Serialized as query params rather than path segments so an existing
// /dashboard/leads/:leadId?botId=... link (bookmarked, or in an old email)
// still resolves — see parseLeadRef's chat fallback.

export function leadRefToSearch(ref: LeadRef): string {
  const params = new URLSearchParams({ source: ref.source })
  if (ref.source === 'chat') params.set('botId', ref.botId)
  if (ref.source === 'form') params.set('formId', ref.formId)
  if (ref.source === 'meta') params.set('pageId', ref.pageId)
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

  if (source === 'form' && formId) return { source, formId, leadId }
  if (source === 'meta' && pageId) return { source, pageId, leadId }
  if (source === 'chat' && botId) return { source, botId, leadId }

  // No `source` but a botId: a link minted before the inbox existed. Treated as
  // a chat lead, which is the only thing it could have been.
  if (!source && botId) return { source: 'chat', botId, leadId }

  return null
}
