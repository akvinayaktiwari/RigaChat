import { getLeadById } from '../repositories/lead-repository.js'
import { getFormLeadById } from '../repositories/form-lead-repository.js'
import { getMetaLeadById } from '../repositories/meta-lead-repository.js'
import { getAgentForResource } from '../repositories/agent-binding-lookup-repository.js'
import { getAgents } from './agent-service.js'
import type {
  Agent,
  FormLead,
  JourneyLead,
  Lead,
  LeadRef,
  LeadResolution,
  MetaLead,
} from '../types/index.js'

// -------------------------------------------------------------------------
// Makes a lead from ANY source addressable by the journey layer.
//
// Two separate jobs, deliberately kept separate:
//   readJourneyLead()          -- reads the record, whatever table it lives in
//   resolveLeadAgentContext()  -- decides which Agent (and therefore which
//                                 botId) should work it
//
// See the LeadRef comment in types/index.ts for why the lead's parent key and
// the Agent's botId are different things.
// -------------------------------------------------------------------------

// Best-effort extraction of the standard contact fields out of a form lead's
// free-form customFields map. Same shape, and the same honest limitation, as
// meta-lead-service.ts's mapMetaFieldData: a client names their own form
// fields, so this matches on the label. A form whose phone field is called
// "reach me on" will not be picked up, and that is a known miss rather than a
// silent bug -- the field-mapping UI tracked in TODOS.md is the real fix.
function pickField(fields: Record<string, unknown>, candidates: readonly string[]): string | undefined {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || value.length === 0) continue
    const normalized = key.toLowerCase()
    if (candidates.some((candidate) => normalized.includes(candidate))) {
      return value
    }
  }
  return undefined
}

function parseCustomFields(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    // A malformed customFields blob must not take the journey down -- the lead
    // still exists and still has a leadId worth acting on. Contact fields
    // simply come back undefined, which downstream steps already handle
    // (handleSendMessage returns no_phone_number rather than throwing).
    return {}
  }
}

// Pure record -> JourneyLead mappings, one per source.
//
// Split out of readJourneyLead so a caller that ALREADY holds records (the
// unified inbox, which lists whole tables at once) normalizes them without a
// second per-lead read. readJourneyLead below is now just "fetch, then
// normalize" -- there is still exactly one definition of what a form lead's
// phone number is.
export function normalizeChatLead(lead: Lead): JourneyLead {
  return {
    leadId: lead.leadId,
    clientId: lead.clientId,
    source: 'chat',
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    propertyInterest: lead.propertyInterest,
    budgetRange: lead.budgetRange,
    sourceUrl: lead.sourceUrl,
  }
}

export function normalizeMetaLead(lead: MetaLead): JourneyLead {
  return {
    leadId: lead.leadId,
    clientId: lead.clientId,
    source: 'meta',
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    propertyInterest: lead.propertyInterest,
    budgetRange: lead.budgetRange,
    sourceUrl: lead.sourceUrl,
  }
}

export function normalizeFormLead(lead: FormLead): JourneyLead {
  const fields = parseCustomFields(lead.customFields)
  return {
    leadId: lead.leadId,
    clientId: lead.clientId,
    source: 'form',
    name: pickField(fields, ['name']),
    phone: pickField(fields, ['phone', 'mobile', 'contact', 'whatsapp']),
    email: pickField(fields, ['email', 'e-mail']),
    propertyInterest: pickField(fields, ['property', 'interest', 'project']),
    budgetRange: pickField(fields, ['budget', 'price']),
    sourceUrl: lead.sourceUrl,
  }
}

export async function readJourneyLead(leadRef: LeadRef): Promise<JourneyLead | null> {
  switch (leadRef.source) {
    case 'chat': {
      const lead = await getLeadById(leadRef.botId, leadRef.leadId)
      return lead ? normalizeChatLead(lead) : null
    }
    case 'meta': {
      const lead = await getMetaLeadById(leadRef.pageId, leadRef.leadId)
      return lead ? normalizeMetaLead(lead) : null
    }
    case 'form': {
      const lead = await getFormLeadById(leadRef.formId, leadRef.leadId)
      return lead ? normalizeFormLead(lead) : null
    }
  }
}

function webBindingBotId(agent: Agent): string | undefined {
  return agent.channels.web?.resourceId
}

// Which Agent works this lead?
//
// A chat lead already names its bot, so the binding lookup answers exactly.
// Every other source (a Facebook Page, a web form) has no bot, so the only
// available signal is the owning client -- and we refuse to guess when that is
// ambiguous. Silently handing a lead to the wrong Agent means the wrong
// persona, wrong knowledge base and wrong calendar messaging a real buyer,
// which is worse than not starting a journey at all.
//
// The conservative-over-clever posture matches backfill-agents.ts, which
// already skips any client with more than one bot rather than pairing by guess.
export async function resolveLeadAgentContext(leadRef: LeadRef, clientId: string): Promise<LeadResolution> {
  const agent = await findAgentForLead(leadRef, clientId)
  if (!agent.found) {
    return { resolved: false, reason: agent.reason }
  }

  const botId = webBindingBotId(agent.agent)
  if (!botId) {
    // The Agent exists but has no web channel wired, so there is no botId to
    // scope Pinecone retrieval, load bot config, or partition an
    // AppointmentRequest by. Reported rather than defaulted: inventing a botId
    // here is precisely the mis-scoping this design rejected.
    return { resolved: false, reason: 'agent_has_no_web_binding' }
  }

  return {
    resolved: true,
    context: {
      leadRef,
      leadId: leadRef.leadId,
      clientId,
      agentId: agent.agent.agentId,
      botId,
    },
  }
}

type AgentLookup =
  | { found: true; agent: Agent }
  | { found: false; reason: 'no_agent' | 'ambiguous_agent' }

async function findAgentForLead(leadRef: LeadRef, clientId: string): Promise<AgentLookup> {
  if (leadRef.source === 'chat') {
    const binding = await getAgentForResource(leadRef.botId)
    if (!binding) return { found: false, reason: 'no_agent' }

    const agents = await getAgents(clientId)
    const agent = agents.find((candidate) => candidate.agentId === binding.agentId)
    // A binding pointing at an Agent this client does not own means the bot
    // belongs to someone else. Treat it as unresolvable rather than following
    // the binding across a tenant boundary.
    return agent ? { found: true, agent } : { found: false, reason: 'no_agent' }
  }

  const agents = await getAgents(clientId)
  if (agents.length === 0) return { found: false, reason: 'no_agent' }
  if (agents.length > 1) return { found: false, reason: 'ambiguous_agent' }
  return { found: true, agent: agents[0]! }
}
