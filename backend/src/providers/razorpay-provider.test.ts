import { describe, expect, it, vi, beforeEach } from 'vitest'

const create = vi.fn()
vi.mock('../lib/razorpay.js', () => ({
  razorpayClient: { subscriptions: { create: (...a: unknown[]) => create(...a) } },
}))

const { razorpayProvider, asRazorpayError, RazorpayApiError } = await import('./razorpay-provider.js')

beforeEach(() => create.mockReset())

// THE BUG THIS FILE EXISTS FOR.
//
// razorpay/dist/api.js normalizeError() throws a PLAIN OBJECT, not an Error:
//   throw { statusCode: err.response.status, error: err.response.data.error }
// Upstream, billing-service.ts does
//   `error instanceof Error ? error.message : String(error)`
// which for a plain object yields the literal string "[object Object]". Every
// failed checkout returned exactly that, so the reason Razorpay gave was
// destroyed at the boundary and reached neither CloudWatch nor the response.
//
// asRazorpayError is exercised directly rather than by making the mocked SDK
// reject: Vitest attaches its own handler to a mock's returned promise to
// record settled results, which leaves a derived rejection unhandled and
// reports it as an extra failure carrying the raw value. That is a harness
// artifact, and routing around it keeps these assertions about the
// normalisation logic, which is where the defect actually was.
describe('normalising the SDK plain-object rejection', () => {
  const rejection = {
    statusCode: 400,
    error: {
      code: 'BAD_REQUEST_ERROR',
      description: 'The requested URL was not found on the server.',
      field: 'plan_id',
      reason: 'input_validation_failed',
      source: 'business',
      step: 'payment_initiation',
    },
  }

  const OP = 'Razorpay createSubscription(plan_id=plan_TFl5GSmRUtfMdr) failed'

  it('does not stringify to "[object Object]"', () => {
    expect(String(asRazorpayError(OP, rejection))).not.toContain('[object Object]')
  })

  it('is a real Error, so `instanceof Error` upstream is true', () => {
    expect(asRazorpayError(OP, rejection)).toBeInstanceOf(Error)
  })

  it("carries Razorpay's description, code and field in the message", () => {
    const { message } = asRazorpayError(OP, rejection)

    expect(message).toContain('The requested URL was not found on the server.')
    expect(message).toContain('BAD_REQUEST_ERROR')
    expect(message).toContain('plan_id')
  })

  it('names the plan id that failed, since the tier is what varies', () => {
    expect(asRazorpayError(OP, rejection).message).toContain('plan_TFl5GSmRUtfMdr')
  })

  it('exposes the fields structurally, not only as text', () => {
    const error = asRazorpayError(OP, rejection) as InstanceType<typeof RazorpayApiError>

    expect(error.code).toBe('BAD_REQUEST_ERROR')
    expect(error.statusCode).toBe(400)
    expect(error.field).toBe('plan_id')
  })

  it('still produces a usable message when Razorpay sends no description', () => {
    const error = asRazorpayError(OP, { statusCode: 500, error: { code: 'SERVER_ERROR' } })

    expect(error.message).toContain('SERVER_ERROR')
    expect(error.message).not.toContain('undefined')
  })
})

describe('other failure shapes', () => {
  // normalizeError itself throws a TypeError when err.response is undefined
  // (a DNS failure or connection reset), so a real Error can arrive here too.
  it('rethrows a genuine Error untouched rather than rewrapping it', () => {
    const network = new TypeError("Cannot read properties of undefined (reading 'status')")

    expect(asRazorpayError('op', network)).toBe(network)
  })

  it('still produces an Error for a rejection matching no known shape', () => {
    const error = asRazorpayError('op', 'something odd')

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('something odd')
  })
})

describe('the success path is unchanged', () => {
  it('returns the new subscription id and status', async () => {
    create.mockResolvedValue({ id: 'sub_123', status: 'created' })

    await expect(razorpayProvider.createSubscription('plan_X', { clientId: 'c1' })).resolves.toEqual({
      id: 'sub_123',
      status: 'created',
    })
  })

  it('sends the documented 100-year monthly cycle count', async () => {
    create.mockResolvedValue({ id: 'sub_123', status: 'created' })

    await razorpayProvider.createSubscription('plan_X', { clientId: 'c1', tier: 'starter' })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: 'plan_X', total_count: 1200, quantity: 1 })
    )
  })
})
