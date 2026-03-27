import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { authMiddleware } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import { updateModeSchema } from '../utils/validation.js'

const mode = new Hono()

mode.get('/', authMiddleware, async c => {
  const settings = await prisma.appSettings.findUnique({
    where: { id: 'settings' },
  })
  return c.json({
    mode: settings?.mode ?? 'game',
    battleConfig: settings?.battleConfig ?? null,
  })
})

mode.put('/', requireAdmin, async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = updateModeSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const settings = await prisma.appSettings.upsert({
    where: { id: 'settings' },
    update: {
      mode: parsed.data.mode,
      ...(parsed.data.battleConfig !== undefined && {
        battleConfig: JSON.parse(JSON.stringify(parsed.data.battleConfig)),
      }),
    },
    create: {
      id: 'settings',
      mode: parsed.data.mode,
      battleConfig: parsed.data.battleConfig
        ? JSON.parse(JSON.stringify(parsed.data.battleConfig))
        : undefined,
    },
  })

  return c.json({
    mode: settings.mode,
    battleConfig: settings.battleConfig ?? null,
  })
})

export default mode
