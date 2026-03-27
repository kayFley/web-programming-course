import type { Context, Next } from 'hono'
import { verify } from 'hono/jwt'

const JWT_SECRET =
  process.env['JWT_SECRET'] ?? 'your-secret-key-change-in-production'

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = await verify(token, JWT_SECRET, 'HS256')
    c.set('jwtPayload', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
