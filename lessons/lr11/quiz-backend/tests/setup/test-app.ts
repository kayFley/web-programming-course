import { Hono } from 'hono'
import { cors } from 'hono/cors'
import auth from '../../src/routes/auth.js'
import sessions from '../../src/routes/sessions.js'
import categories from '../../src/routes/categories.js'
import questions from '../../src/routes/questions.js'
import mode from '../../src/routes/mode.js'
import admin from '../../src/routes/admin.js'

export function createTestApp() {
  const app = new Hono()

  app.use('*', cors())

  app.route('/api/auth', auth)
  app.route('/api/sessions', sessions)
  app.route('/api/categories', categories)
  app.route('/api/questions', questions)
  app.route('/api/mode', mode)
  app.route('/api/admin', admin)

  app.notFound(c =>
    c.json({ error: 'Not Found', message: 'Route not found' }, 404),
  )

  return app
}
