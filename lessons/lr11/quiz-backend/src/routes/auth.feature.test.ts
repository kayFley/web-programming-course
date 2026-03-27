import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestApp } from '../../tests/setup/test-app.js'
import {
  testPrisma,
  makeToken,
  createTestUser,
  cleanupUser,
} from '../../tests/setup/test-db.js'

const app = createTestApp()

function post(path: string, body: unknown, token?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

function get(path: string, token?: string) {
  return app.request(path, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

function put(path: string, body: unknown, token?: string) {
  return app.request(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const TEST_SUFFIX = `feat_auth_${Date.now()}`
let studentUserId: string
let studentToken: string
let callbackCreatedGithubUsername: string

beforeAll(async () => {
  const user = await createTestUser(TEST_SUFFIX, 'student')
  studentUserId = user.id
  studentToken = await makeToken(user.id)
})

afterAll(async () => {
  if (callbackCreatedGithubUsername) {
    await testPrisma.user.deleteMany({
      where: { githubUsername: callbackCreatedGithubUsername },
    })
  }
  await cleanupUser(studentUserId)
  await testPrisma.$disconnect()
})

describe('POST /api/auth/github/callback', () => {
  it('returns 400 when body is missing code', async () => {
    const res = await post('/api/auth/github/callback', {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 400 when code is empty string', async () => {
    const res = await post('/api/auth/github/callback', { code: '' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is invalid JSON structure', async () => {
    const res = await app.request('/api/auth/github/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
  })

  it('creates user and returns token for test_ code', async () => {
    const callbackCode = `test_vitest_${TEST_SUFFIX}`
    const res = await post('/api/auth/github/callback', { code: callbackCode })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
    expect(body.user).toBeDefined()
    expect(body.user.githubUsername).toBeDefined()

    callbackCreatedGithubUsername = body.user.githubUsername
  })

  it('is idempotent — same test_ code upserts existing user', async () => {
    const callbackCode = `test_vitest_${TEST_SUFFIX}`
    const res1 = await post('/api/auth/github/callback', { code: callbackCode })
    const res2 = await post('/api/auth/github/callback', { code: callbackCode })
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    const b1 = await res1.json()
    const b2 = await res2.json()
    expect(b1.user.id).toBe(b2.user.id)
  })
})

describe('GET /api/auth/me', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is malformed', async () => {
    const res = await get('/api/auth/me', 'not.a.valid.jwt')
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is signed with wrong secret', async () => {
    // Manually craft a token with wrong secret via fetch — just use garbage
    const res = await get(
      '/api/auth/me',
      'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.bad',
    )
    expect(res.status).toBe(401)
  })

  it('returns 200 with user profile for valid token', async () => {
    const res = await get('/api/auth/me', studentToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeDefined()
    expect(body.user.id).toBe(studentUserId)
    expect(body.user.role).toBe('student')
  })
})

describe('PUT /api/auth/profile', () => {
  it('returns 401 without token', async () => {
    const res = await put('/api/auth/profile', {
      firstName: 'A',
      lastName: 'B',
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when firstName is missing', async () => {
    const res = await put(
      '/api/auth/profile',
      { lastName: 'Petrov' },
      studentToken,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when lastName is empty', async () => {
    const res = await put(
      '/api/auth/profile',
      { firstName: 'Ivan', lastName: '' },
      studentToken,
    )
    expect(res.status).toBe(400)
  })

  it('updates profile and returns updated user data', async () => {
    const res = await put(
      '/api/auth/profile',
      { firstName: 'Ivan', lastName: 'Petrov' },
      studentToken,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.firstName).toBe('Ivan')
    expect(body.lastName).toBe('Petrov')
  })
})

describe('POST /api/auth/logout', () => {
  it('returns 401 without token', async () => {
    const res = await post('/api/auth/logout', {})
    expect(res.status).toBe(401)
  })

  it('returns 200 with success message for valid token', async () => {
    const res = await post('/api/auth/logout', {}, studentToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toContain('Logged out')
  })
})
