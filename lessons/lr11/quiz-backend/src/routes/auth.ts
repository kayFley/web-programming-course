import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { prisma } from '../lib/prisma.js'
import { authMiddleware } from '../middleware/auth.js'
import {
  githubCallbackSchema,
  updateProfileSchema,
} from '../utils/validation.js'

const auth = new Hono()

const JWT_SECRET =
  process.env['JWT_SECRET'] ?? 'your-secret-key-change-in-production'
const GITHUB_CLIENT_ID = process.env['GITHUB_CLIENT_ID'] ?? ''
const GITHUB_CLIENT_SECRET = process.env['GITHUB_CLIENT_SECRET'] ?? ''

interface GitHubUser {
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
}

function getMockGitHubUser(code: string): GitHubUser {
  const suffix = code.replace(/^test_/, '') || 'user'
  const githubId =
    Array.from(suffix).reduce(
      (acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0x7fffffff,
      0,
    ) || 1
  return {
    id: githubId,
    login: `mock_${suffix}`,
    name: `Mock User (${suffix})`,
    email: `mock_${suffix}@example.com`,
    avatar_url: `https://avatars.githubusercontent.com/u/${githubId}`,
  }
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`)
  }

  const data = (await response.json()) as {
    access_token?: string
    error?: string
  }

  if (data.error || !data.access_token) {
    throw new Error(data.error ?? 'No access_token returned from GitHub')
  }

  return data.access_token
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    }),
  ])

  if (!userRes.ok) {
    throw new Error(`Failed to fetch GitHub user: ${userRes.status}`)
  }

  const user = (await userRes.json()) as GitHubUser

  if (!user.email && emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{
      email: string
      primary: boolean
      verified: boolean
    }>
    const primary = emails.find(e => e.primary && e.verified)
    if (primary) {
      user.email = primary.email
    }
  }

  return user
}

function formatUser(user: {
  id: string
  githubId: string
  githubUsername: string
  avatarUrl: string
  firstName: string | null
  lastName: string | null
  email: string | null
  role: string
  createdAt: Date
}) {
  return {
    id: user.id,
    githubId: parseInt(user.githubId),
    githubUsername: user.githubUsername,
    avatarUrl: user.avatarUrl,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    email: user.email ?? undefined,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

auth.post('/github/callback', async c => {
  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      { error: 'Invalid JSON body', message: 'Could not parse request body' },
      400,
    )
  }

  const parsed = githubCallbackSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        message: 'Invalid request',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const { code } = parsed.data

  let githubUser: GitHubUser

  try {
    if (code.startsWith('test_')) {
      githubUser = getMockGitHubUser(code)
    } else {
      const accessToken = await exchangeCodeForToken(code)
      githubUser = await fetchGitHubUser(accessToken)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GitHub OAuth failed'
    return c.json({ error: 'Bad Gateway', message }, 502)
  }

  const user = await prisma.user.upsert({
    where: { githubId: String(githubUser.id) },
    update: {
      name: githubUser.name ?? githubUser.login,
      email: githubUser.email,
      githubUsername: githubUser.login,
      avatarUrl: githubUser.avatar_url,
    },
    create: {
      githubId: String(githubUser.id),
      name: githubUser.name ?? githubUser.login,
      email: githubUser.email,
      githubUsername: githubUser.login,
      avatarUrl: githubUser.avatar_url,
      role: 'student',
    },
    select: {
      id: true,
      githubId: true,
      githubUsername: true,
      avatarUrl: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
    },
  })

  const token = await sign(
    {
      userId: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
    },
    JWT_SECRET,
  )

  return c.json({ token, user: formatUser(user) })
})

auth.get('/me', authMiddleware, async c => {
  const payload = c.get('jwtPayload') as { userId: string }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      githubId: true,
      githubUsername: true,
      avatarUrl: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
    },
  })

  if (!user) {
    return c.json({ error: 'Not Found', message: 'User not found' }, 404)
  }

  return c.json({ user: formatUser(user) })
})

auth.put('/profile', authMiddleware, async c => {
  const payload = c.get('jwtPayload') as { userId: string }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const user = await prisma.user.update({
    where: { id: payload.userId },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    },
    select: {
      id: true,
      githubId: true,
      githubUsername: true,
      avatarUrl: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  })

  return c.json({
    id: user.id,
    githubId: parseInt(user.githubId),
    githubUsername: user.githubUsername,
    avatarUrl: user.avatarUrl,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    role: user.role,
  })
})

auth.post('/logout', authMiddleware, async c => {
  return c.json({ message: 'Logged out successfully' })
})

export default auth
