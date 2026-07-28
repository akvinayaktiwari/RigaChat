import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  createScheduledAction,
  deleteScheduledAction,
  getScheduledActions,
  ScheduleValidationError,
  updateScheduledActionCadence,
} from '../services/scheduler-service.js'
import type { ApiResponse, ScheduleCadence, ScheduledAction, ScheduledActionType } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const schedulerRoutes = new Hono<AuthEnv>()

const SCHEDULED_ACTION_TYPES: ScheduledActionType[] = ['weekly_report']

interface CreateScheduledActionBody {
  actionType?: string
  cadence?: ScheduleCadence
}

interface UpdateScheduledActionBody {
  cadence?: ScheduleCadence
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

schedulerRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<CreateScheduledActionBody>()

  if (!body.actionType || !body.cadence) {
    return c.json<ApiResponse<null>>({ success: false, error: 'actionType and cadence are required' }, 400)
  }
  if (!SCHEDULED_ACTION_TYPES.includes(body.actionType as ScheduledActionType)) {
    return c.json<ApiResponse<null>>(
      { success: false, error: `actionType must be one of: ${SCHEDULED_ACTION_TYPES.join(', ')}` },
      400
    )
  }

  try {
    const action = await createScheduledAction({
      clientId,
      actionType: body.actionType as ScheduledActionType,
      cadence: body.cadence,
    })
    return c.json<ApiResponse<ScheduledAction>>({ success: true, data: action }, 201)
  } catch (error) {
    if (error instanceof ScheduleValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

schedulerRoutes.get('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const actions = await getScheduledActions(clientId)
    return c.json<ApiResponse<ScheduledAction[]>>({ success: true, data: actions }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

schedulerRoutes.patch('/:scheduleId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const scheduleId = c.req.param('scheduleId')
  const body = await c.req.json<UpdateScheduledActionBody>()

  if (!body.cadence) {
    return c.json<ApiResponse<null>>({ success: false, error: 'cadence is required' }, 400)
  }

  try {
    const action = await updateScheduledActionCadence(clientId, scheduleId, body.cadence)
    return c.json<ApiResponse<ScheduledAction>>({ success: true, data: action }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Scheduled action not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    if (error instanceof ScheduleValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

schedulerRoutes.delete('/:scheduleId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const scheduleId = c.req.param('scheduleId')

  try {
    await deleteScheduledAction(clientId, scheduleId)
    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Scheduled action deleted' } }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Scheduled action not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
