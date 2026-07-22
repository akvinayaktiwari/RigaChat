import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  addKBEntry,
  confirmKBUpload,
  getKBEntries,
  getKBUploadUrl,
  removeKBEntry,
  updateKBEntry,
} from '../services/kb-service.js'
import type { KBFileType, KBUploadUrlResult } from '../services/kb-service.js'
import { EntitlementError, toEntitlementErrorResponse } from '../services/entitlement-service.js'
import type { ApiResponse, KnowledgeBaseEntry } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const kbRoutes = new Hono<AuthEnv>()

interface AddKBEntryBody {
  botId?: string
  title?: string
  content?: string
}

interface UpdateKBEntryBody {
  title?: string
  content?: string
}

const KB_FILE_TYPES: KBFileType[] = ['pdf', 'docx', 'text']

interface UploadUrlBody {
  botId?: string
  filename?: string
  fileType?: string
  fileSizeBytes?: number
}

interface ConfirmUploadBody {
  botId?: string
  entryId?: string
  filename?: string
  fileType?: string
  fileSizeBytes?: number
  s3Key?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

kbRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<AddKBEntryBody>()

  if (!body.botId || !body.title || !body.content) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId, title, and content are required' },
      400
    )
  }

  try {
    const entry = await addKBEntry({
      botId: body.botId,
      clientId,
      title: body.title,
      content: body.content,
    })
    return c.json<ApiResponse<KnowledgeBaseEntry>>({ success: true, data: entry }, 201)
  } catch (error) {
    if (error instanceof EntitlementError) {
      const { status, body } = toEntitlementErrorResponse(error)
      return c.json(body, status)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

kbRoutes.post('/upload-url', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<UploadUrlBody>()

  if (!body.botId || !body.filename || !body.fileType || typeof body.fileSizeBytes !== 'number') {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId, filename, fileType, and fileSizeBytes are required' },
      400
    )
  }

  if (!KB_FILE_TYPES.includes(body.fileType as KBFileType)) {
    return c.json<ApiResponse<null>>(
      { success: false, error: `fileType must be one of: ${KB_FILE_TYPES.join(', ')}` },
      400
    )
  }

  // filename becomes the last segment of the S3 key
  // ({clientId}/{botId}/{kbEntryId}/{filename}) -- reject '/' so a crafted
  // filename can't inject extra path segments into that structure.
  if (body.filename.includes('/')) {
    return c.json<ApiResponse<null>>({ success: false, error: 'filename must not contain "/"' }, 400)
  }

  try {
    const result = await getKBUploadUrl({
      botId: body.botId,
      clientId,
      filename: body.filename,
      fileType: body.fileType as KBFileType,
      fileSizeBytes: body.fileSizeBytes,
    })
    return c.json<ApiResponse<KBUploadUrlResult>>({ success: true, data: result }, 200)
  } catch (error) {
    if (error instanceof EntitlementError) {
      const { status, body: errBody } = toEntitlementErrorResponse(error)
      return c.json(errBody, status)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

kbRoutes.post('/confirm-upload', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<ConfirmUploadBody>()

  if (
    !body.botId ||
    !body.entryId ||
    !body.filename ||
    !body.fileType ||
    typeof body.fileSizeBytes !== 'number' ||
    !body.s3Key
  ) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId, entryId, filename, fileType, fileSizeBytes, and s3Key are required' },
      400
    )
  }

  if (!KB_FILE_TYPES.includes(body.fileType as KBFileType)) {
    return c.json<ApiResponse<null>>(
      { success: false, error: `fileType must be one of: ${KB_FILE_TYPES.join(', ')}` },
      400
    )
  }

  try {
    const entry = await confirmKBUpload({
      botId: body.botId,
      clientId,
      entryId: body.entryId,
      filename: body.filename,
      fileType: body.fileType as KBFileType,
      fileSizeBytes: body.fileSizeBytes,
      s3Key: body.s3Key,
    })
    return c.json<ApiResponse<KnowledgeBaseEntry>>({ success: true, data: entry }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 's3Key does not match expected upload location') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    if (error instanceof EntitlementError) {
      const { status, body: errBody } = toEntitlementErrorResponse(error)
      return c.json(errBody, status)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

kbRoutes.get('/:botId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    const entries = await getKBEntries(botId, clientId)
    return c.json<ApiResponse<KnowledgeBaseEntry[]>>({ success: true, data: entries }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

kbRoutes.patch('/:botId/:entryId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const entryId = c.req.param('entryId')
  const body = await c.req.json<UpdateKBEntryBody>()

  if (!body.title || !body.content) {
    return c.json<ApiResponse<null>>({ success: false, error: 'title and content are required' }, 400)
  }

  try {
    const entry = await updateKBEntry(botId, entryId, clientId, {
      title: body.title,
      content: body.content,
    })
    return c.json<ApiResponse<KnowledgeBaseEntry>>({ success: true, data: entry }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'KB entry not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

kbRoutes.delete('/:botId/:entryId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const entryId = c.req.param('entryId')

  try {
    await removeKBEntry(botId, entryId, clientId)
    return c.json<ApiResponse<{ message: string }>>(
      { success: true, data: { message: 'Knowledge base entry deleted' } },
      200
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'KB entry not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    if (error instanceof Error && error.message === 'KB entry is still being processed') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
