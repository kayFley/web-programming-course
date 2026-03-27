import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestApp } from '../../tests/setup/test-app.js'
import {
  testPrisma,
  makeToken,
  createTestUser,
  cleanupUser,
  ensureAppSettings,
} from '../../tests/setup/test-db.js'

const app = createTestApp()

function req(method: string, path: string, token?: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const TS = `feat_sess_${Date.now()}`

let studentId: string
let studentToken: string
let otherStudentId: string
let otherStudentToken: string
let adminId: string
let adminToken: string

let sessionId: string
let firstQuestionId: string
let firstQuestionType: string

beforeAll(async () => {
  await ensureAppSettings()

  const student = await createTestUser(`student_${TS}`, 'student')
  studentId = student.id
  studentToken = await makeToken(student.id)

  const other = await createTestUser(`other_${TS}`, 'student')
  otherStudentId = other.id
  otherStudentToken = await makeToken(other.id)

  const admin = await createTestUser(`admin_${TS}`, 'admin')
  adminId = admin.id
  adminToken = await makeToken(admin.id)
})

afterAll(async () => {
  await cleanupUser(studentId)
  await cleanupUser(otherStudentId)
  await cleanupUser(adminId)
  await testPrisma.$disconnect()
})

describe('Security: unauthenticated requests', () => {
  it('POST /api/sessions → 401 without token', async () => {
    const res = await req('POST', '/api/sessions', undefined, {})
    expect(res.status).toBe(401)
  })

  it('POST /api/sessions → 401 with malformed token', async () => {
    const res = await req('POST', '/api/sessions', 'garbage.token.here', {})
    expect(res.status).toBe(401)
  })

  it('GET /api/sessions/any-id → 401 without token', async () => {
    const res = await req('GET', '/api/sessions/any-id')
    expect(res.status).toBe(401)
  })
})

describe('Security: role-based access control', () => {
  it('GET /api/admin/questions → 403 for student token', async () => {
    const res = await req('GET', '/api/admin/questions', studentToken)
    expect(res.status).toBe(403)
  })

  it('GET /api/admin/questions → 403 even with valid but non-admin token', async () => {
    const res = await req('GET', '/api/admin/questions', otherStudentToken)
    expect(res.status).toBe(403)
  })

  it('GET /api/admin/questions → 401 without any token', async () => {
    const res = await req('GET', '/api/admin/questions')
    expect(res.status).toBe(401)
  })

  it('GET /api/admin/questions → 200 for admin token', async () => {
    const res = await req('GET', '/api/admin/questions', adminToken)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/sessions', () => {
  it('creates a session and returns questions list', async () => {
    const res = await req('POST', '/api/sessions', studentToken, {})
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.sessionId).toBeDefined()
    expect(Array.isArray(body.questions)).toBe(true)
    expect(body.questions.length).toBeGreaterThan(0)
    expect(body.status).toBe('active')
    expect(body.userId).toBe(studentId)

    sessionId = body.sessionId
    const firstQ = body.questions[0]
    firstQuestionId = firstQ.id
    firstQuestionType = firstQ.type
  })

  it('returns 400 for invalid difficulty filter', async () => {
    const res = await req('POST', '/api/sessions', studentToken, {
      difficulty: 'impossible',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when questionCount is out of range', async () => {
    const res = await req('POST', '/api/sessions', studentToken, {
      questionCount: 0,
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/sessions/:id', () => {
  it('returns session details for its owner', async () => {
    const res = await req('GET', `/api/sessions/${sessionId}`, studentToken)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe(sessionId)
    expect(body.status).toBe('active')
  })

  it('returns 403 when requested by a different user', async () => {
    const res = await req(
      'GET',
      `/api/sessions/${sessionId}`,
      otherStudentToken,
    )
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent session', async () => {
    const res = await req('GET', '/api/sessions/nonexistent-id', studentToken)
    expect(res.status).toBe(404)
  })
})

describe('POST /api/sessions/:id/answers', () => {
  it('returns 400 when questionId is missing from body', async () => {
    const res = await req(
      'POST',
      `/api/sessions/${sessionId}/answers`,
      studentToken,
      { selectedOptions: [0] },
    )
    expect(res.status).toBe(400)
  })

  it('submits a valid answer and returns scored result', async () => {
    const answerBody =
      firstQuestionType === 'multiple-select'
        ? { questionId: firstQuestionId, selectedOptions: [0] }
        : {
            questionId: firstQuestionId,
            text: 'A'.repeat(200),
          }

    const res = await req(
      'POST',
      `/api/sessions/${sessionId}/answers`,
      studentToken,
      answerBody,
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.questionId).toBe(firstQuestionId)
    expect(body.status).toBeDefined()
  })

  it('returns 400 when answering the same question twice', async () => {
    const answerBody =
      firstQuestionType === 'multiple-select'
        ? { questionId: firstQuestionId, selectedOptions: [0] }
        : { questionId: firstQuestionId, text: 'A'.repeat(200) }

    const res = await req(
      'POST',
      `/api/sessions/${sessionId}/answers`,
      studentToken,
      answerBody,
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toContain('already answered')
  })

  it('returns 400 when questionId is not part of the session', async () => {
    const res = await req(
      'POST',
      `/api/sessions/${sessionId}/answers`,
      studentToken,
      { questionId: 'foreign-question-id', selectedOptions: [0] },
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/sessions/:id/submit', () => {
  it('submits session and returns completed status', async () => {
    const res = await req(
      'POST',
      `/api/sessions/${sessionId}/submit`,
      studentToken,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(['completed', 'partial']).toContain(body.status)
    expect(body.score).toBeDefined()
    expect(typeof body.score.earned).toBe('number')
  })

  it('returns 400 when trying to submit an already-completed session', async () => {
    const res = await req(
      'POST',
      `/api/sessions/${sessionId}/submit`,
      studentToken,
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.message).toContain('already completed')
  })
})

describe('GET /api/sessions/:id/results', () => {
  it('returns results for a completed session', async () => {
    const res = await req(
      'GET',
      `/api/sessions/${sessionId}/results`,
      studentToken,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe(sessionId)
    expect(body.score).toBeDefined()
    expect(Array.isArray(body.answers)).toBe(true)
  })

  it('returns 403 for results of another user session', async () => {
    const res = await req(
      'GET',
      `/api/sessions/${sessionId}/results`,
      otherStudentToken,
    )
    expect(res.status).toBe(403)
  })
})
