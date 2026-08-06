import type { McpCapability } from '../types/index.js'

// The one runtime list of MCP capabilities, derived from the McpCapability
// union rather than duplicating it. `Record<McpCapability, true>` is what makes
// this safe: adding a member to the union without adding it here is a compile
// error, so the list can never silently drift out of sync with the type. A
// plain `const MCP_CAPABILITIES: McpCapability[] = [...]` would catch a typo
// but NOT a missing entry, which is the failure that actually matters -- a
// capability missing here would be rejected at the route boundary despite
// being perfectly valid.
const CAPABILITY_SET: Record<McpCapability, true> = {
  booking: true,
  reminder: true,
  quotation: true,
  brochure: true,
}

export const MCP_CAPABILITIES = Object.keys(CAPABILITY_SET) as McpCapability[]

// Narrows untrusted input (a client-supplied request body) to the palette.
// Used at the route boundary so an invalid capability is a 400 at edit time,
// not a failed Task state days later on a real lead.
export function isMcpCapability(value: unknown): value is McpCapability {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITY_SET, value)
}

// Returns the offending entries so the route can name them in the error,
// rather than a generic "invalid toolbox" the client has to guess at.
export function findInvalidCapabilities(values: readonly unknown[]): string[] {
  return values.filter((value) => !isMcpCapability(value)).map((value) => String(value))
}
