import { createClient, getClientById, updateClient } from '../repositories/client-repository.js'
import type { ClientRecord } from '../types/index.js'

interface UpsertClientInput {
  clientId: string
  email: string
  name: string
}

export async function upsertClient(input: UpsertClientInput): Promise<ClientRecord> {
  try {
    const existing = await getClientById(input.clientId)

    if (existing) {
      return await updateClient(input.clientId, { name: input.name, email: input.email })
    }

    return await createClient({
      clientId: input.clientId,
      email: input.email,
      name: input.name,
      authProvider: 'google',
      plan: 'starter',
    })
  } catch (error) {
    throw new Error(
      `Failed to upsert client ${input.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getClient(clientId: string): Promise<ClientRecord> {
  const client = await getClientById(clientId)
  if (!client) {
    throw new Error('Client not found')
  }
  return client
}

export async function upgradeClientPlan(
  clientId: string,
  plan: ClientRecord['plan']
): Promise<ClientRecord> {
  try {
    return await updateClient(clientId, { plan })
  } catch (error) {
    throw new Error(
      `Failed to upgrade plan for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
