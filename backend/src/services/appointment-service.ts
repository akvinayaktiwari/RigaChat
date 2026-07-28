import { getAppointmentRequestsByBotId } from '../repositories/appointment-request-repository.js'
import { getBotConfig } from './bot-service.js'
import type { AppointmentRequest } from '../types/index.js'

// Read-only surface for what booking-mcp-server.ts's bookAppointment()
// writes -- routes call this, never the repository directly. getBotConfig
// throws 'Bot not found' both when the bot genuinely doesn't exist and
// when it belongs to a different clientId, same 404-either-way pattern as
// kb-service.ts's getKBEntries().
export async function getAppointmentRequests(botId: string, clientId: string): Promise<AppointmentRequest[]> {
  await getBotConfig(botId, clientId)
  return getAppointmentRequestsByBotId(botId)
}
