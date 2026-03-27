import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { requireAdmin } from '../middleware/admin.js'
import { sessionService } from '../services/sessionService.js'
import {
  scoringService,
  type QuestionOption,
} from '../services/scoringService.js'
import {
  createQuestionSchema,
  updateQuestionSchema,
  gradeEssaySchema,
  setDifficultySchema,
} from '../utils/validation.js'

const admin = new Hono()

admin.use('*', requireAdmin)

function getAdminId(c: { get: (k: string) => unknown }): string {
  const payload = c.get('jwtPayload') as { userId: string }
  return payload.userId
}

function mapQuestionFull(q: {
  id: string
  type: string
  text: string
  difficulty: string
  categoryId: string
  options: unknown
  penaltyPerWrong: number | null
  minScore: number | null
  rubric: unknown
  minLength: number | null
  maxLength: number | null
  createdAt: Date
  updatedAt: Date
  _count?: { answers: number }
}) {
  const opts = q.options as QuestionOption[] | null
  const rub = q.rubric as Array<{
    criterion: string
    maxPoints: number
    description?: string
  }> | null
  return {
    id: q.id,
    type: q.type,
    question: q.text,
    difficulty: q.difficulty,
    categoryId: q.categoryId,
    maxPoints: scoringService.getMaxPoints(opts, rub),
    options: opts ?? undefined,
    penaltyPerWrong: q.penaltyPerWrong ?? undefined,
    minScore: q.minScore ?? undefined,
    rubric: rub ?? undefined,
    minLength: q.minLength ?? undefined,
    maxLength: q.maxLength ?? undefined,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    answerCount: q._count?.answers,
  }
}

admin.get('/questions', async c => {
  const { categoryId, difficulty, type, limit, offset } = c.req.query()

  const where: Record<string, unknown> = {}
  if (categoryId) where['categoryId'] = categoryId
  if (difficulty) where['difficulty'] = difficulty
  if (type) where['type'] = type

  const take = Math.min(parseInt(limit ?? '20', 10), 100)
  const skip = parseInt(offset ?? '0', 10)

  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { answers: true } } },
    }),
  ])

  return c.json({ questions: rows.map(mapQuestionFull), total })
})

admin.get('/questions/:id', async c => {
  const { id } = c.req.param()
  const q = await prisma.question.findUnique({
    where: { id },
    include: { _count: { select: { answers: true } } },
  })
  if (!q)
    return c.json({ error: 'Not Found', message: 'Question not found' }, 404)
  return c.json(mapQuestionFull(q))
})

admin.post('/questions', async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = createQuestionSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const {
    question,
    type,
    difficulty,
    categoryId,
    options,
    penaltyPerWrong,
    minScore,
    rubric,
    minLength,
    maxLength,
  } = parsed.data

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  })
  if (!category)
    return c.json({ error: 'Not Found', message: 'Category not found' }, 404)

  if (type === 'multiple-select' && (!options || options.length < 2)) {
    return c.json(
      {
        error: 'Bad Request',
        message: 'multiple-select requires at least 2 options',
      },
      400,
    )
  }

  const q = await prisma.question.create({
    data: {
      text: question,
      type,
      difficulty,
      categoryId,
      options: options ? JSON.parse(JSON.stringify(options)) : undefined,
      penaltyPerWrong: penaltyPerWrong ?? 0.5,
      minScore: minScore ?? 0,
      rubric: rubric ? JSON.parse(JSON.stringify(rubric)) : undefined,
      minLength: minLength ?? null,
      maxLength: maxLength ?? null,
    },
    include: { _count: { select: { answers: true } } },
  })

  return c.json(mapQuestionFull(q), 201)
})

admin.put('/questions/:id', async c => {
  const { id } = c.req.param()

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = updateQuestionSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const existing = await prisma.question.findUnique({ where: { id } })
  if (!existing)
    return c.json({ error: 'Not Found', message: 'Question not found' }, 404)

  const {
    question,
    difficulty,
    categoryId,
    options,
    penaltyPerWrong,
    minScore,
    rubric,
    minLength,
    maxLength,
  } = parsed.data

  const q = await prisma.question.update({
    where: { id },
    data: {
      ...(question && { text: question }),
      ...(difficulty && { difficulty }),
      ...(categoryId && { categoryId }),
      ...(options !== undefined && {
        options: JSON.parse(JSON.stringify(options)),
      }),
      ...(penaltyPerWrong !== undefined && { penaltyPerWrong }),
      ...(minScore !== undefined && { minScore }),
      ...(rubric !== undefined && {
        rubric: JSON.parse(JSON.stringify(rubric)),
      }),
      ...(minLength !== undefined && { minLength }),
      ...(maxLength !== undefined && { maxLength }),
    },
    include: { _count: { select: { answers: true } } },
  })

  return c.json(mapQuestionFull(q))
})

admin.delete('/questions/:id', async c => {
  const { id } = c.req.param()
  const existing = await prisma.question.findUnique({ where: { id } })
  if (!existing)
    return c.json({ error: 'Not Found', message: 'Question not found' }, 404)
  await prisma.question.delete({ where: { id } })
  return c.body(null, 204)
})

admin.get('/answers/pending', async c => {
  const { limit, offset } = c.req.query()
  const take = Math.min(parseInt(limit ?? '20', 10), 100)
  const skip = parseInt(offset ?? '0', 10)

  const [total, answers] = await Promise.all([
    prisma.answer.count({ where: { status: 'pending' } }),
    prisma.answer.findMany({
      where: { status: 'pending' },
      take,
      skip,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        questionId: true,
        sessionId: true,
        userAnswer: true,
        status: true,
        createdAt: true,
        question: {
          select: { id: true, text: true, type: true, rubric: true },
        },
        session: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                githubUsername: true,
              },
            },
          },
        },
      },
    }),
  ])

  return c.json({
    answers: answers.map(a => ({
      answerId: a.id,
      questionId: a.questionId,
      sessionId: a.sessionId,
      userAnswer: a.userAnswer,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      question: {
        id: a.question.id,
        text: a.question.text,
        rubric: a.question.rubric,
      },
      student: a.session.user,
    })),
    total,
    limit: take,
    offset: skip,
  })
})

admin.post('/answers/:id/grade', async c => {
  const adminId = getAdminId(c)
  const { id: answerId } = c.req.param()

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = gradeEssaySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  try {
    const answer = await sessionService.gradeEssay(
      {
        answerId,
        rubricScores: parsed.data.rubricScores,
        generalFeedback: parsed.data.generalFeedback,
      },
      adminId,
    )

    const question = await prisma.question.findUnique({
      where: { id: answer.questionId },
    })
    const opts = question?.options as QuestionOption[] | null
    const rub = question?.rubric as Array<{ maxPoints: number }> | null

    return c.json({
      answerId: answer.id,
      questionId: answer.questionId,
      status: answer.status,
      pointsEarned: answer.score ?? 0,
      maxPoints: scoringService.getMaxPoints(opts, rub),
      feedback: answer.feedback ?? undefined,
      rubricScores: answer.rubricScores as unknown[],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Grading failed'
    const status = msg === 'Answer not found' ? 404 : 400
    return c.json({ error: 'Error', message: msg }, status as 400 | 404)
  }
})

admin.get('/users', async c => {
  const { limit, offset } = c.req.query()
  const take = Math.min(parseInt(limit ?? '20', 10), 100)
  const skip = parseInt(offset ?? '0', 10)

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      take,
      skip,
      orderBy: { createdAt: 'desc' },
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
        difficultySettings: true,
        _count: { select: { sessions: true } },
        sessions: {
          where: { status: 'completed' },
          select: { score: true, completedAt: true },
          orderBy: { completedAt: 'desc' },
        },
      },
    }),
  ])

  return c.json({
    users: users.map(u => {
      const completedSessions = u.sessions.filter(s => s.score !== null)
      const avgScore =
        completedSessions.length > 0
          ? completedSessions.reduce((sum, s) => sum + (s.score ?? 0), 0) /
            completedSessions.length
          : undefined

      return {
        id: u.id,
        githubId: parseInt(u.githubId),
        githubUsername: u.githubUsername,
        avatarUrl: u.avatarUrl,
        firstName: u.firstName ?? undefined,
        lastName: u.lastName ?? undefined,
        email: u.email ?? undefined,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        stats: {
          totalSessions: u._count.sessions,
          completedSessions: completedSessions.length,
          averageScore: avgScore,
          lastSessionAt: u.sessions[0]?.completedAt?.toISOString(),
        },
        difficultySettings: u.difficultySettings
          ? {
              ...(u.difficultySettings as object),
            }
          : undefined,
      }
    }),
    total,
  })
})

admin.put('/users/:userId/difficulty', async c => {
  const adminId = getAdminId(c)
  const { userId } = c.req.param()

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = setDifficultySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user)
    return c.json({ error: 'Not Found', message: 'User not found' }, 404)

  const settings = {
    difficulty: parsed.data.difficulty,
    questionCount: parsed.data.questionCount,
    categoryIds: parsed.data.categoryIds,
    updatedAt: new Date().toISOString(),
    updatedBy: adminId,
  }

  await prisma.user.update({
    where: { id: userId },
    data: { difficultySettings: settings },
  })

  return c.json(settings)
})

admin.get('/users/:userId/results', async c => {
  const { userId } = c.req.param()

  const user = await prisma.user.findUnique({
    where: { id: userId },
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
  if (!user)
    return c.json({ error: 'Not Found', message: 'User not found' }, 404)

  const completedSessions = await prisma.session.findMany({
    where: { userId, status: { in: ['completed', 'expired'] } },
    orderBy: { completedAt: 'desc' },
    include: {
      answers: {
        include: { question: { include: { category: true } } },
      },
    },
  })

  const sessionResults = completedSessions.map(session => {
    const questionIds = session.questions as string[]
    const answers = session.answers
    const earnedScore = answers.reduce((sum, a) => sum + (a.score ?? 0), 0)
    const maxScore = answers.reduce((sum, a) => {
      const opts = a.question.options as QuestionOption[] | null
      const rub = a.question.rubric as Array<{ maxPoints: number }> | null
      return sum + scoringService.getMaxPoints(opts, rub)
    }, 0)
    const hasPending = answers.some(a => a.status === 'pending')

    return {
      sessionId: session.id,
      userId: session.userId,
      status: hasPending ? 'partial' : 'completed',
      mode: session.mode,
      totalQuestions: questionIds.length,
      answeredQuestions: answers.length,
      score: {
        earned: earnedScore,
        max: maxScore,
        percentage:
          maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0,
      },
      answers: answers.map(a => ({
        answerId: a.id,
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        status: a.status,
        pointsEarned: a.score ?? 0,
        feedback: a.feedback ?? undefined,
        rubricScores: a.rubricScores as unknown[] | undefined,
      })),
      completedAt: session.completedAt?.toISOString() ?? null,
    }
  })

  return c.json({
    userId: user.id,
    user: {
      id: user.id,
      githubId: parseInt(user.githubId),
      githubUsername: user.githubUsername,
      avatarUrl: user.avatarUrl,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      email: user.email ?? undefined,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    sessions: sessionResults,
  })
})

export default admin
