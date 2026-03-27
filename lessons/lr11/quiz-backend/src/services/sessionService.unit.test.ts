import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    question: { findMany: vi.fn(), findUnique: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    answer: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../lib/prisma.js'
import { SessionService } from './sessionService.js'

const service = new SessionService()

const mockSession = {
  id: 'sess-1',
  userId: 'user-1',
  status: 'active',
  mode: 'game',
  questions: ['q-1', 'q-2'],
  expiresAt: new Date(Date.now() + 3_600_000),
  startedAt: new Date(),
  score: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  answers: [],
}

const mockMultipleSelectQuestion = {
  id: 'q-1',
  type: 'multiple-select',
  text: 'Pick correct answers',
  difficulty: 'easy',
  categoryId: 'cat-1',
  options: [
    { text: 'Right', points: 2, isCorrect: true },
    { text: 'Wrong', points: 0, isCorrect: false },
  ],
  penaltyPerWrong: 0.5,
  minScore: 0,
  minLength: null,
  maxLength: null,
  rubric: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockEssayQuestion = {
  id: 'q-2',
  type: 'essay',
  text: 'Explain something.',
  difficulty: 'medium',
  categoryId: 'cat-1',
  options: null,
  penaltyPerWrong: null,
  minScore: null,
  minLength: 10,
  maxLength: 500,
  rubric: [{ criterion: 'Accuracy', maxPoints: 5 }],
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SessionService.createSession', () => {
  it('creates session with shuffled questions when questions exist', async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      { id: 'q-1' },
      { id: 'q-2' },
    ] as any)
    vi.mocked(prisma.session.create).mockResolvedValue({
      ...mockSession,
      questions: ['q-1', 'q-2'],
    } as any)

    const session = await service.createSession({
      userId: 'user-1',
      mode: 'game',
    })

    expect(prisma.question.findMany).toHaveBeenCalledOnce()
    expect(prisma.session.create).toHaveBeenCalledOnce()
    expect(session.id).toBe('sess-1')
  })

  it('throws when no questions match the filters', async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([])

    await expect(
      service.createSession({ userId: 'user-1', mode: 'game' }),
    ).rejects.toThrow('No questions available for the given filters')
  })

  it('applies categoryIds filter to the query', async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      { id: 'q-1' },
    ] as any)
    vi.mocked(prisma.session.create).mockResolvedValue(mockSession as any)

    await service.createSession({
      userId: 'user-1',
      mode: 'game',
      categoryIds: ['cat-js'],
    })

    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['cat-js'] } }),
      }),
    )
  })

  it('limits selected questions to questionCount', async () => {
    const manyQuestions = Array.from({ length: 20 }, (_, i) => ({
      id: `q-${i}`,
    }))
    vi.mocked(prisma.question.findMany).mockResolvedValue(manyQuestions as any)
    vi.mocked(prisma.session.create).mockResolvedValue({
      ...mockSession,
      questions: manyQuestions.slice(0, 3).map(q => q.id),
    } as any)

    await service.createSession({
      userId: 'user-1',
      mode: 'game',
      questionCount: 3,
    })

    const createCall = vi.mocked(prisma.session.create).mock.calls[0]?.[0]
    expect(
      (createCall?.data?.questions as string[]).length,
    ).toBeLessThanOrEqual(3)
  })
})

describe('SessionService.submitAnswer', () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
      fn(prisma),
    )
  })

  it('scores multiple-select and returns result', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.answer.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.question.findUnique).mockResolvedValue(
      mockMultipleSelectQuestion as any,
    )
    vi.mocked(prisma.answer.create).mockResolvedValue({
      id: 'ans-1',
      score: 2,
      status: 'correct',
    } as any)

    const result = await service.submitAnswer({
      sessionId: 'sess-1',
      userId: 'user-1',
      questionId: 'q-1',
      selectedOptions: [0],
    })

    expect(result.type).toBe('result')
    if (result.type === 'result') {
      expect(result.status).toBe('correct')
      expect(result.pointsEarned).toBe(2)
    }
  })

  it('saves essay answer as pending without grading', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.answer.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.question.findUnique).mockResolvedValue(
      mockEssayQuestion as any,
    )
    vi.mocked(prisma.answer.create).mockResolvedValue({
      id: 'ans-2',
      score: null,
      status: 'pending',
    } as any)

    const result = await service.submitAnswer({
      sessionId: 'sess-1',
      userId: 'user-1',
      questionId: 'q-2',
      text: 'This is my answer about the topic in question.',
    })

    expect(result.type).toBe('pending')
    expect(result.status).toBe('pending')
  })

  it('throws when session not found', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null)

    await expect(
      service.submitAnswer({
        sessionId: 'missing',
        userId: 'user-1',
        questionId: 'q-1',
        selectedOptions: [0],
      }),
    ).rejects.toThrow('Session not found')
  })

  it('throws when question already answered', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.answer.findUnique).mockResolvedValue({
      id: 'existing',
    } as any)
    vi.mocked(prisma.question.findUnique).mockResolvedValue(
      mockMultipleSelectQuestion as any,
    )

    await expect(
      service.submitAnswer({
        sessionId: 'sess-1',
        userId: 'user-1',
        questionId: 'q-1',
        selectedOptions: [0],
      }),
    ).rejects.toThrow('Question already answered')
  })

  it('throws when essay answer is too short', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.answer.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.question.findUnique).mockResolvedValue(
      mockEssayQuestion as any,
    )

    await expect(
      service.submitAnswer({
        sessionId: 'sess-1',
        userId: 'user-1',
        questionId: 'q-2',
        text: 'short',
      }),
    ).rejects.toThrow('Answer too short')
  })
})

describe('SessionService.submitSession', () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
      fn(prisma),
    )
  })

  it('marks session as completed and returns updated session', async () => {
    const completedSession = {
      ...mockSession,
      status: 'completed',
      completedAt: new Date(),
      score: 0,
    }
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSession,
      answers: [],
    } as any)
    vi.mocked(prisma.session.update).mockResolvedValue(completedSession as any)

    const result = await service.submitSession('sess-1', 'user-1')

    expect(prisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    )
    expect(result.status).toBe('completed')
  })

  it('throws when session not found', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null)

    await expect(service.submitSession('missing', 'user-1')).rejects.toThrow(
      'Session not found',
    )
  })

  it('throws when session belongs to another user', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSession,
      userId: 'other-user',
      answers: [],
    } as any)

    await expect(service.submitSession('sess-1', 'user-1')).rejects.toThrow(
      'Forbidden',
    )
  })

  it('throws when session already completed', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...mockSession,
      status: 'completed',
      answers: [],
    } as any)

    await expect(service.submitSession('sess-1', 'user-1')).rejects.toThrow(
      'Session already completed',
    )
  })
})
