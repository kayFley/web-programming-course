import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { prisma } from './lib/prisma.js'
import auth from './routes/auth.js'
import sessions from './routes/sessions.js'
import categories from './routes/categories.js'
import questions from './routes/questions.js'
import mode from './routes/mode.js'
import admin from './routes/admin.js'

const app = new Hono()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

app.get('/health', c => {
  return c.json({ status: 'ok' })
})

app.route('/api/auth', auth)
app.route('/api/sessions', sessions)
app.route('/api/categories', categories)
app.route('/api/questions', questions)
app.route('/api/mode', mode)
app.route('/api/admin', admin)

app.notFound(c => {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404,
  )
})

app.onError((err, c) => {
  console.error('[Server Error]', err)
  return c.json(
    { error: 'Internal Server Error', message: 'An unexpected error occurred' },
    500,
  )
})

async function bootstrap() {
  await prisma.appSettings.upsert({
    where: { id: 'settings' },
    update: {},
    create: { id: 'settings', mode: 'game' },
  })

  serve(
    {
      fetch: app.fetch,
      port: 3000,
    },
    info => {
      console.log(`\n🚀 Server running on http://localhost:${info.port}`)
      console.log(`\n  Auth:`)
      console.log(`   POST /api/auth/github/callback`)
      console.log(`   GET  /api/auth/me`)
      console.log(`   PUT  /api/auth/profile`)
      console.log(`   POST /api/auth/logout`)
      console.log(`\n  Quiz:`)
      console.log(`   GET  /api/categories`)
      console.log(`   GET  /api/questions`)
      console.log(`   GET  /api/mode`)
      console.log(`\n  Sessions:`)
      console.log(`   POST /api/sessions`)
      console.log(`   GET  /api/sessions/:id`)
      console.log(`   POST /api/sessions/:id/answers`)
      console.log(`   POST /api/sessions/:id/submit`)
      console.log(`   GET  /api/sessions/:id/results`)
      console.log(`\n  Admin:`)
      console.log(`   GET  /api/admin/questions`)
      console.log(`   POST /api/admin/questions`)
      console.log(`   PUT  /api/admin/questions/:id`)
      console.log(`   DELETE /api/admin/questions/:id`)
      console.log(`   GET  /api/admin/answers/pending`)
      console.log(`   POST /api/admin/answers/:id/grade`)
      console.log(`   GET  /api/admin/users`)
      console.log(`   PUT  /api/admin/users/:userId/difficulty`)
      console.log(`   GET  /api/admin/users/:userId/results`)
      console.log(`   PUT  /api/mode`)
      console.log()
    },
  )
}

bootstrap().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
