import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  addVoiceKBEntry,
  AgentAlreadyHasNumberError,
  assignVoiceAgentPhoneNumber,
  confirmVoiceKBUpload,
  createVoiceAgent,
  deleteVoiceAgent,
  getVoiceAgentById,
  getVoiceAgentContext,
  getVoiceAgentPhoneNumber,
  getVoiceAgentPublicConfig,
  getVoiceAgentRecord,
  getVoiceAgents,
  getVoiceAgentUsage,
  getVoiceKBEntries,
  getVoiceKBUploadUrl,
  InvalidPhoneNumberError,
  PhoneNumberInUseError,
  releaseVoiceAgentPhoneNumber,
  removeVoiceKBEntry,
  setupVoiceAgent,
  updateVoiceAgent,
  updateVoiceKBEntry,
} from '../services/voice-service.js'
import type { KBFileType, KBUploadUrlResult } from '../services/kb-service.js'
import { retrieveContext } from '../services/rag-service.js'
import { generateToken, validateToken } from '../lib/voice-token.js'
import { checkEntitlement, EntitlementError, toEntitlementErrorResponse } from '../services/entitlement-service.js'
import type {
  ApiResponse,
  VoiceAgent,
  VoiceKnowledgeBaseEntry,
  VoicePhoneLookup,
  VoiceUsageSummary,
} from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const voiceRoutes = new Hono<AuthEnv>()

interface CreateVoiceAgentBody {
  name?: string
  voice?: VoiceAgent['voice']
  greetingMessage?: string
  websiteUrl?: string
  brandColor?: string
  widgetPosition?: VoiceAgent['widgetPosition']
  maxSessionDuration?: VoiceAgent['maxSessionDuration']
}

type UpdateVoiceAgentBody = Partial<
  Pick<
    VoiceAgent,
    'name' | 'voice' | 'greetingMessage' | 'systemPrompt' | 'brandColor' | 'widgetPosition' | 'maxSessionDuration' | 'isEnabled'
  >
>

interface AssignPhoneNumberBody {
  phoneNumber?: string
}

interface AddVoiceKBEntryBody {
  title?: string
  content?: string
}

interface UpdateVoiceKBEntryBody {
  title?: string
  content?: string
}

const VOICE_KB_FILE_TYPES: KBFileType[] = ['pdf', 'docx', 'text']

interface VoiceKBUploadUrlBody {
  filename?: string
  fileType?: string
  fileSizeBytes?: number
}

interface VoiceKBConfirmUploadBody {
  entryId?: string
  filename?: string
  fileType?: string
  fileSizeBytes?: number
  s3Key?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'Voice agent not found' ||
      error.message === 'Voice agent is not enabled' ||
      error.message === 'Knowledge base entry not found')
  )
}

voiceRoutes.post('/', requireAuth, async (c) => {
  const body = await c.req.json<CreateVoiceAgentBody>()

  if (
    !body.name ||
    !body.voice ||
    !body.greetingMessage ||
    !body.brandColor ||
    !body.widgetPosition ||
    !body.maxSessionDuration
  ) {
    return c.json<ApiResponse<null>>(
      {
        success: false,
        error: 'name, voice, greetingMessage, brandColor, widgetPosition, and maxSessionDuration are required',
      },
      400
    )
  }

  const clientId = c.get('user').sub

  try {
    const agent = await createVoiceAgent({
      clientId,
      name: body.name,
      voice: body.voice,
      greetingMessage: body.greetingMessage,
      websiteUrl: body.websiteUrl,
      brandColor: body.brandColor,
      widgetPosition: body.widgetPosition,
      maxSessionDuration: body.maxSessionDuration,
    })

    try {
      await setupVoiceAgent(agent.agentId, clientId)
    } catch (setupError) {
      console.error(`Failed to auto-trigger indexing for voice agent ${agent.agentId}:`, setupError)
    }

    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 201)
  } catch (error) {
    if (error instanceof EntitlementError) {
      const { status, body } = toEntitlementErrorResponse(error)
      return c.json(body, status)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.get('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const agents = await getVoiceAgents(clientId)
    return c.json<ApiResponse<VoiceAgent[]>>({ success: true, data: agents }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// Public route — widget calls this from external client websites.
// Security: HMAC token (VOICE_AUTH_SECRET), not Cognito JWT.
voiceRoutes.get('/token', async (c) => {
  const agentId = c.req.query('agentId')

  if (!agentId) {
    return c.json({ error: 'agentId required' }, 400)
  }

  const agent = await getVoiceAgentRecord(agentId)
  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404)
  }

  try {
    await checkEntitlement(agent.clientId, 'voice')
  } catch (error) {
    if (error instanceof EntitlementError) {
      const { status, body } = toEntitlementErrorResponse(error)
      return c.json(body, status)
    }
    throw error
  }

  const token = generateToken(agentId, process.env.VOICE_AUTH_SECRET ?? '')
  return c.json({ token, expiresIn: 300 }, 200)
})

voiceRoutes.get('/public/:id', async (c) => {
  const agentId = c.req.param('id')

  try {
    const config = await getVoiceAgentPublicConfig(agentId)
    return c.json<ApiResponse<typeof config>>({ success: true, data: config }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// Public route — called by voice widget from external client websites.
// Returns assembled OpenAI session instructions for this agent.
voiceRoutes.get('/context/:agentId', async (c) => {
  const agentId = c.req.param('agentId')

  try {
    const agent = await getVoiceAgentContext(agentId)

    const base =
      agent.systemPrompt && agent.systemPrompt.length > 0
        ? agent.systemPrompt
        : `You are ${agent.name}, a helpful voice assistant. Start the call by greeting the caller with: "${agent.greetingMessage}"`

    const instructions = `${base}\nKeep responses concise — this is a voice conversation, 2-3 sentences max.`

    return c.json({ instructions, voice: agent.voice, botName: agent.name }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json({ error: 'Agent not found' }, 404)
    }
    return c.json({ error: errorMessage(error) }, 500)
  }
})

// Called by the EC2 voice relay during tool-calling. Searches this
// agent's own Pinecone namespace, plus the linked bot's namespace
// if botId is set, merges results.
voiceRoutes.post('/rag', async (c) => {
  const body = await c.req.json<{ agentId: string; query: string; token: string }>()

  if (!body.agentId || !body.query) {
    return c.json({ error: 'agentId and query required' }, 400)
  }

  const { valid, agentId: tokenAgentId } = validateToken(body.token ?? '', process.env.VOICE_AUTH_SECRET ?? '')
  if (!valid || tokenAgentId !== body.agentId) {
    return c.json({ error: 'Invalid or missing token' }, 401)
  }

  try {
    const agent = await getVoiceAgentContext(body.agentId)

    const agentChunks = await retrieveContext(body.agentId, body.query)

    let botChunks: string[] = []
    if (agent.botId) {
      botChunks = await retrieveContext(agent.botId, body.query)
    }

    const merged = [...agentChunks, ...botChunks].slice(0, 5)

    return c.json({ chunks: merged }, 200)
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 500)
  }
})

voiceRoutes.get('/:id', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    const agent = await getVoiceAgentById(agentId, clientId)
    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.patch('/:id', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')
  const updates = await c.req.json<UpdateVoiceAgentBody>()

  if (typeof updates.systemPrompt === 'string' && updates.systemPrompt.length > 1000) {
    return c.json({ error: 'systemPrompt must be 1000 characters or fewer' }, 400)
  }

  try {
    const agent = await updateVoiceAgent(agentId, clientId, updates)
    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.delete('/:id', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    await deleteVoiceAgent(agentId, clientId)
    return c.body(null, 204)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.post('/:id/setup', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    const agent = await setupVoiceAgent(agentId, clientId)
    return c.json<ApiResponse<VoiceAgent>>({ success: true, data: agent }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.get('/:id/usage', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    const usage = await getVoiceAgentUsage(agentId, clientId)
    return c.json<ApiResponse<VoiceUsageSummary>>({ success: true, data: usage }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// The Plivo DID this agent answers on. Null is a normal answer, not an error:
// most agents are browser-only and will never have a number.
voiceRoutes.get('/:id/phone-number', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    const assignment = await getVoiceAgentPhoneNumber(agentId, clientId)
    return c.json<ApiResponse<VoicePhoneLookup | null>>({ success: true, data: assignment }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// PUT, not POST: assigning the same number to the same agent twice is the same
// end state, and the underlying claim is deliberately idempotent for exactly
// that reason.
voiceRoutes.put('/:id/phone-number', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  let body: AssignPhoneNumberBody
  try {
    body = await c.req.json<AssignPhoneNumberBody>()
  } catch {
    return c.json<ApiResponse<null>>({ success: false, error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.phoneNumber !== 'string' || !body.phoneNumber.trim()) {
    return c.json<ApiResponse<null>>({ success: false, error: 'phoneNumber is required' }, 400)
  }

  try {
    const assignment = await assignVoiceAgentPhoneNumber(agentId, clientId, body.phoneNumber)
    return c.json<ApiResponse<VoicePhoneLookup>>({ success: true, data: assignment }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    if (error instanceof InvalidPhoneNumberError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    // 409, not 400: the request is well-formed and the client cannot fix it by
    // correcting their input -- someone else holds the number, or this agent
    // already has one and must release it first.
    if (error instanceof PhoneNumberInUseError || error instanceof AgentAlreadyHasNumberError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// No number in the path: the server already knows which one this agent holds,
// and taking it from the caller would let a wrong value delete a row for an
// agent they own but did not mean to touch.
voiceRoutes.delete('/:id/phone-number', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    await releaseVoiceAgentPhoneNumber(agentId, clientId)
    return c.body(null, 204)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.post('/:id/kb', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')
  const body = await c.req.json<AddVoiceKBEntryBody>()

  if (!body.title || !body.content) {
    return c.json<ApiResponse<null>>({ success: false, error: 'title and content are required' }, 400)
  }

  try {
    const entry = await addVoiceKBEntry(agentId, clientId, body.title, body.content)
    return c.json<ApiResponse<VoiceKnowledgeBaseEntry>>({ success: true, data: entry }, 201)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.get('/:id/kb', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')

  try {
    const entries = await getVoiceKBEntries(agentId, clientId)
    return c.json<ApiResponse<VoiceKnowledgeBaseEntry[]>>({ success: true, data: entries }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.post('/:id/kb/upload-url', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')
  const body = await c.req.json<VoiceKBUploadUrlBody>()

  if (!body.filename || !body.fileType || typeof body.fileSizeBytes !== 'number') {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'filename, fileType, and fileSizeBytes are required' },
      400
    )
  }

  if (!VOICE_KB_FILE_TYPES.includes(body.fileType as KBFileType)) {
    return c.json<ApiResponse<null>>(
      { success: false, error: `fileType must be one of: ${VOICE_KB_FILE_TYPES.join(', ')}` },
      400
    )
  }

  // filename becomes the last segment of the S3 key
  // ({clientId}/voice-agents/{agentId}/{entryId}/{filename}) -- reject '/'
  // so a crafted filename can't inject extra path segments.
  if (body.filename.includes('/')) {
    return c.json<ApiResponse<null>>({ success: false, error: 'filename must not contain "/"' }, 400)
  }

  try {
    const result = await getVoiceKBUploadUrl({
      agentId,
      clientId,
      filename: body.filename,
      fileType: body.fileType as KBFileType,
      fileSizeBytes: body.fileSizeBytes,
    })
    return c.json<ApiResponse<KBUploadUrlResult>>({ success: true, data: result }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    if (error instanceof EntitlementError) {
      const { status, body: errBody } = toEntitlementErrorResponse(error)
      return c.json(errBody, status)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.post('/:id/kb/confirm-upload', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')
  const body = await c.req.json<VoiceKBConfirmUploadBody>()

  if (
    !body.entryId ||
    !body.filename ||
    !body.fileType ||
    typeof body.fileSizeBytes !== 'number' ||
    !body.s3Key
  ) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'entryId, filename, fileType, fileSizeBytes, and s3Key are required' },
      400
    )
  }

  if (!VOICE_KB_FILE_TYPES.includes(body.fileType as KBFileType)) {
    return c.json<ApiResponse<null>>(
      { success: false, error: `fileType must be one of: ${VOICE_KB_FILE_TYPES.join(', ')}` },
      400
    )
  }

  try {
    const entry = await confirmVoiceKBUpload({
      agentId,
      clientId,
      entryId: body.entryId,
      filename: body.filename,
      fileType: body.fileType as KBFileType,
      fileSizeBytes: body.fileSizeBytes,
      s3Key: body.s3Key,
    })
    return c.json<ApiResponse<VoiceKnowledgeBaseEntry>>({ success: true, data: entry }, 201)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    if (error instanceof Error && error.message === 's3Key does not match expected upload location') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.patch('/:id/kb/:entryId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')
  const entryId = c.req.param('entryId')
  const body = await c.req.json<UpdateVoiceKBEntryBody>()

  if (!body.title || !body.content) {
    return c.json<ApiResponse<null>>({ success: false, error: 'title and content are required' }, 400)
  }

  try {
    const entry = await updateVoiceKBEntry(agentId, clientId, entryId, {
      title: body.title,
      content: body.content,
    })
    return c.json<ApiResponse<VoiceKnowledgeBaseEntry>>({ success: true, data: entry }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Voice agent not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

voiceRoutes.delete('/:id/kb/:entryId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const agentId = c.req.param('id')
  const entryId = c.req.param('entryId')

  try {
    await removeVoiceKBEntry(agentId, clientId, entryId)
    return c.json<ApiResponse<null>>({ success: true }, 200)
  } catch (error) {
    if (isNotFoundError(error)) {
      return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 404)
    }
    if (error instanceof Error && error.message === 'Knowledge base entry is still being processed') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

