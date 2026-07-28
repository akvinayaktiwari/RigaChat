import { beforeEach, describe, expect, it, vi } from 'vitest'

const incrementWaitAndRecheckIteration = vi.fn()

vi.mock('../repositories/journey-execution-repository.js', () => ({
  incrementWaitAndRecheckIteration,
}))

const { executeJourneyStep } = await import('./journey-executor-service.js')

const baseContext = { botId: 'bot-1', bundleId: 'bundle-1', leadId: 'lead-1', channel: 'web_widget' as const }

beforeEach(() => {
  incrementWaitAndRecheckIteration.mockReset()
})

describe('executeJourneyStep', () => {
  describe('wait_and_recheck_check', () => {
    it('is never satisfied yet (no real data model to check against)', async () => {
      incrementWaitAndRecheckIteration.mockResolvedValueOnce(1)

      const result = await executeJourneyStep({
        ...baseContext,
        operation: 'wait_and_recheck_check',
        stepId: 'poll',
        maxIterations: 5,
      })

      expect(result).toMatchObject({ satisfied: false })
    })

    it('is not exhausted while the iteration count is below maxIterations', async () => {
      incrementWaitAndRecheckIteration.mockResolvedValueOnce(3)

      const result = await executeJourneyStep({
        ...baseContext,
        operation: 'wait_and_recheck_check',
        stepId: 'poll',
        maxIterations: 5,
      })

      expect(result).toMatchObject({ exhausted: false })
    })

    it('is exhausted once the iteration count reaches maxIterations', async () => {
      incrementWaitAndRecheckIteration.mockResolvedValueOnce(5)

      const result = await executeJourneyStep({
        ...baseContext,
        operation: 'wait_and_recheck_check',
        stepId: 'poll',
        maxIterations: 5,
      })

      expect(result).toMatchObject({ exhausted: true })
      expect(incrementWaitAndRecheckIteration).toHaveBeenCalledWith('lead-1', 'poll')
    })

    it('throws when stepId or maxIterations is missing', async () => {
      await expect(
        executeJourneyStep({ ...baseContext, operation: 'wait_and_recheck_check' })
      ).rejects.toThrow(/missing stepId or maxIterations/)
      expect(incrementWaitAndRecheckIteration).not.toHaveBeenCalled()
    })
  })

  it('send_message returns an unsent stub without throwing', async () => {
    const result = await executeJourneyStep({ ...baseContext, operation: 'send_message', stepId: 'greet' })
    expect(result).toEqual({ sent: false, stub: true })
  })

  it('tool_call returns a stub without throwing', async () => {
    const result = await executeJourneyStep({ ...baseContext, operation: 'tool_call', toolName: 'booking' })
    expect(result).toEqual({ stub: true })
  })

  it('human_handoff acknowledges the handoff', async () => {
    const result = await executeJourneyStep({ ...baseContext, operation: 'human_handoff', stepId: 'handoff' })
    expect(result).toEqual({ handedOff: true })
  })
})
