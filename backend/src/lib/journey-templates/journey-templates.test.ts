import { describe, expect, it } from 'vitest'
import { findJourneyTemplate, listJourneyTemplates } from './index.js'
import { compileJourneyToAsl } from '../../services/journey-compiler-service.js'
import { isMcpCapability } from '../mcp-capabilities.js'

// This file is the enforcement half of "prebuilt agents are code, not data".
// Because templates ship in the repo, a broken one can be caught by CI rather
// than by a client hitting publish. Every check below exists so that a bad
// template fails `npm test`, not production.
const templates = listJourneyTemplates()

describe('journey template library', () => {
  it('ships at least one template', () => {
    expect(templates.length).toBeGreaterThan(0)
  })

  it('has unique templateIds', () => {
    const ids = templates.map((t) => t.templateId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns a fresh copy each call so a caller cannot mutate the library', () => {
    const first = listJourneyTemplates()[0]
    const second = listJourneyTemplates()[0]
    expect(first).not.toBe(second)

    first!.name = 'mutated'
    expect(listJourneyTemplates()[0]!.name).not.toBe('mutated')
  })

  it('findJourneyTemplate returns null for an unknown id rather than throwing', () => {
    expect(findJourneyTemplate('does-not-exist')).toBeNull()
  })
})

describe.each(templates.map((t) => [t.templateId, t] as const))('template %s', (_id, template) => {
  // The check that matters most: a template whose step graph does not compile
  // would be clonable but unpublishable, so the client would hit the error.
  it('compiles to a valid Step Functions state machine', () => {
    expect(() =>
      compileJourneyToAsl({ ...template.journey, botId: 'ci-bot', clientId: 'ci-client' })
    ).not.toThrow()
  })

  it('declares only real MCP capabilities', () => {
    for (const capability of template.agent.mcpToolbox) {
      expect(isMcpCapability(capability), `"${capability}" is not a real MCP capability`).toBe(true)
    }
  })

  it('only calls tools its own toolbox includes', () => {
    const toolbox = new Set<string>(template.agent.mcpToolbox)
    for (const step of template.journey.steps) {
      if (step.type === 'tool_call') {
        expect(toolbox.has(step.toolName), `step "${step.stepId}" calls uncovered tool "${step.toolName}"`).toBe(true)
      }
    }
  })

  it('starts at a step that actually exists', () => {
    const stepIds = new Set(template.journey.steps.map((step) => step.stepId))
    expect(stepIds.has(template.journey.startStepId)).toBe(true)
  })

  // Project RAG standard: the system prompt must explicitly bound the model to
  // the provided context and say so when the answer isn't there. CLAUDE.md
  // calls this out as never-remove. A template is a system prompt we ship to
  // every client, so an edit that quietly drops the guard would propagate the
  // hallucination risk everywhere at once -- hence a test, not a convention.
  it('keeps the hallucination guard in its system prompt', () => {
    const prompt = template.agent.systemPrompt.toLowerCase()
    expect(prompt).toContain('only answer from the provided context')
    expect(prompt).toMatch(/does not contain the answer/)
  })
})
