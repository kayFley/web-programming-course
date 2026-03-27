import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { authMiddleware } from '../middleware/auth.js'
import { sessionService } from '../services/sessionService.js'
import {
  scoringService,
  type QuestionOption,
} from '../services/scoringService.js'
import { createSessionSchema, submitAnswerSchema } from '../utils/validation.js'

const sessions = new Hono()

sessions.use('*', authMiddleware)

function getUserId(c: { get: (k: string) => unknown }): string {
  const payload = c.get('jwtPayload') as { userId: string }
  return payload.userId
}

function toOptions(raw: unknown): QuestionOption[] | null {
  if (!raw) return null
  return raw as unknown as QuestionOption[]
}

function toRubric(raw: unknown): Array<{ maxPoints: number }> | null {
  if (!raw) return null
  return raw as unknown as Array<{ maxPoints: number }>
}

function getCorrectOptionIndices(
  options: QuestionOption[] | null,
): number[] | undefined {
  if (!options) return undefined
  return options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.isCorrect)
    .map(({ i }) => i)
}

function mapQuestionToPreview(q: {
  id: string
  type: string
  text: string
  difficulty: string
  categoryId: string
  category?: { name: string } | null
  options: unknown
  rubric: unknown
  minLength: number | null
  maxLength: number | null
}) {
  const opts = toOptions(q.options)
  const rub = toRubric(q.rubric)
  return {
    id: q.id,
    type: q.type,
    question: q.text,
    difficulty: q.difficulty,
    categoryId: q.categoryId,
    categoryName: q.category?.name,
    maxPoints: scoringService.getMaxPoints(opts, rub),
    options: opts?.map(o => o.text),
    minLength: q.minLength ?? undefined,
    maxLength: q.maxLength ?? undefined,
  }
}

sessions.post('/', async c => {
  const userId = getUserId(c)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  const parsed = createSessionSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const settings = await prisma.appSettings.findUnique({
    where: { id: 'settings' },
  })
  const mode = settings?.mode ?? 'game'
  const battleConfig = settings?.battleConfig as Record<string, unknown> | null

  let effectiveInput = { ...parsed.data }
  if (mode === 'battle') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { difficultySettings: true },
    })
    const ds = user?.difficultySettings as Record<string, unknown> | null
    if (ds) {
      effectiveInput = {
        categoryIds: (ds['categoryIds'] as string[]) ?? undefined,
        difficulty:
          (ds['difficulty'] as 'easy' | 'medium' | 'hard') ?? undefined,
        questionCount: (ds['questionCount'] as number) ?? undefined,
      }
    }
  }

  try {
    const session = await sessionService.createSession({
      userId,
      mode,
      ...effectiveInput,
      battleConfig: battleConfig
        ? {
            questionCount: battleConfig['questionCount'] as number | undefined,
            timeLimit: battleConfig['timeLimit'] as number | undefined,
            randomOrder: battleConfig['randomOrder'] as boolean | undefined,
          }
        : undefined,
    })

    const questionIds = session.questions as string[]
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: { category: { select: { name: true } } },
    })

    const orderedQuestions = questionIds
      .map(id => questions.find(q => q.id === id))
      .filter((q): q is NonNullable<typeof q> => q !== undefined)

    return c.json({
      sessionId: session.id,
      userId: session.userId,
      status: session.status,
      mode: session.mode,
      questions: orderedQuestions.map(mapQuestionToPreview),
      totalQuestions: questionIds.length,
      answeredCount: 0,
      maxScore: orderedQuestions.reduce((sum, q) => {
        return (
          sum +
          scoringService.getMaxPoints(toOptions(q.options), toRubric(q.rubric))
        )
      }, 0),
      currentScore: 0,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create session'
    return c.json({ error: 'Bad Request', message: msg }, 400)
  }
})

sessions.get('/:id', async c => {
  const userId = getUserId(c)
  const { id } = c.req.param()

  const session = await prisma.session.findUnique({
    where: { id },
    include: { answers: { select: { questionId: true, score: true } } },
  })

  if (!session)
    return c.json({ error: 'Not Found', message: 'Session not found' }, 404)
  if (session.userId !== userId)
    return c.json({ error: 'Forbidden', message: 'Access denied' }, 403)

  if (session.status === 'active' && new Date() > session.expiresAt) {
    await prisma.session.update({ where: { id }, data: { status: 'expired' } })
    session.status = 'expired'
  }

  const questionIds = session.questions as string[]
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    include: { category: { select: { name: true } } },
  })

  const orderedQuestions = questionIds
    .map(qId => questions.find(q => q.id === qId))
    .filter((q): q is NonNullable<typeof q> => q !== undefined)

  const answeredCount = session.answers.length
  const currentScore = session.answers.reduce(
    (sum, a) => sum + (a.score ?? 0),
    0,
  )

  return c.json({
    sessionId: session.id,
    userId: session.userId,
    status: session.status,
    mode: session.mode,
    questions: orderedQuestions.map(mapQuestionToPreview),
    totalQuestions: questionIds.length,
    answeredCount,
    currentScore,
    maxScore: orderedQuestions.reduce((sum, q) => {
      return (
        sum +
        scoringService.getMaxPoints(toOptions(q.options), toRubric(q.rubric))
      )
    }, 0),
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  })
})

sessions.post('/:id/answers', async c => {
  const userId = getUserId(c)
  const { id: sessionId } = c.req.param()

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = submitAnswerSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const { questionId, selectedOptions, text } = parsed.data

  try {
    const result = await sessionService.submitAnswer({
      sessionId,
      userId,
      questionId,
      selectedOptions,
      text,
    })

    if (result.type === 'pending') {
      return c.json({
        answerId: result.answerId,
        questionId: result.questionId,
        status: result.status,
        message: result.message,
      })
    }

    return c.json({
      answerId: result.answerId,
      questionId: result.questionId,
      status: result.status,
      pointsEarned: result.pointsEarned,
      maxPoints: result.maxPoints,
      correctOptions: result.correctOptions,
      breakdown: result.breakdown,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to submit answer'
    const status =
      msg === 'Forbidden' ? 403 : msg === 'Session not found' ? 404 : 400
    return c.json({ error: 'Error', message: msg }, status as 400 | 403 | 404)
  }
})

sessions.post('/:id/submit', async c => {
  const userId = getUserId(c)
  const { id: sessionId } = c.req.param()

  try {
    const session = await sessionService.submitSession(sessionId, userId)

    const questionIds = session.questions as string[]
    const answers = await prisma.answer.findMany({
      where: { sessionId },
      include: { question: { include: { category: true } } },
    })

    const earnedScore = answers.reduce((sum, a) => sum + (a.score ?? 0), 0)
    const maxScore = answers.reduce((sum, a) => {
      return (
        sum +
        scoringService.getMaxPoints(
          toOptions(a.question.options),
          toRubric(a.question.rubric),
        )
      )
    }, 0)
    const hasPending = answers.some(a => a.status === 'pending')

    return c.json({
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
        question: mapQuestionToPreview({
          ...a.question,
          category: a.question.category,
        }),
        userAnswer: a.userAnswer,
        status: a.status,
        pointsEarned: a.score ?? 0,
        maxPoints: scoringService.getMaxPoints(
          toOptions(a.question.options),
          toRubric(a.question.rubric),
        ),
        feedback: a.feedback ?? undefined,
        correctOptions:
          a.question.type === 'multiple-select'
            ? getCorrectOptionIndices(toOptions(a.question.options))
            : undefined,
        rubricScores: a.rubricScores as unknown[] | undefined,
      })),
      completedAt: session.completedAt?.toISOString() ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to submit session'
    const status =
      msg === 'Forbidden' ? 403 : msg === 'Session not found' ? 404 : 400
    return c.json({ error: 'Error', message: msg }, status as 400 | 403 | 404)
  }
})

sessions.get('/:id/results', async c => {
  const userId = getUserId(c)
  const { id: sessionId } = c.req.param()

  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session)
    return c.json({ error: 'Not Found', message: 'Session not found' }, 404)
  if (session.userId !== userId)
    return c.json({ error: 'Forbidden', message: 'Access denied' }, 403)
  if (session.status === 'active') {
    return c.json(
      { error: 'Bad Request', message: 'Session not yet submitted' },
      400,
    )
  }

  const questionIds = session.questions as string[]
  const answers = await prisma.answer.findMany({
    where: { sessionId },
    include: { question: { include: { category: true } } },
  })

  const earnedScore = answers.reduce((sum, a) => sum + (a.score ?? 0), 0)
  const maxScore = answers.reduce((sum, a) => {
    return (
      sum +
      scoringService.getMaxPoints(
        toOptions(a.question.options),
        toRubric(a.question.rubric),
      )
    )
  }, 0)
  const hasPending = answers.some(a => a.status === 'pending')

  return c.json({
    sessionId: session.id,
    userId: session.userId,
    status: hasPending ? 'partial' : 'completed',
    mode: session.mode,
    totalQuestions: questionIds.length,
    answeredQuestions: answers.length,
    score: {
      earned: earnedScore,
      max: maxScore,
      percentage: maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0,
    },
    answers: answers.map(a => ({
      answerId: a.id,
      questionId: a.questionId,
      question: mapQuestionToPreview({
        ...a.question,
        category: a.question.category,
      }),
      userAnswer: a.userAnswer,
      status: a.status,
      pointsEarned: a.score ?? 0,
      maxPoints: scoringService.getMaxPoints(
        toOptions(a.question.options),
        toRubric(a.question.rubric),
      ),
      feedback: a.feedback ?? undefined,
      correctOptions:
        a.question.type === 'multiple-select'
          ? getCorrectOptionIndices(toOptions(a.question.options))
          : undefined,
      rubricScores: a.rubricScores as unknown[] | undefined,
    })),
    completedAt: session.completedAt?.toISOString() ?? null,
    timeSpent: session.completedAt
      ? Math.round(
          (session.completedAt.getTime() - session.startedAt.getTime()) / 1000,
        )
      : undefined,
  })
})

export default sessions
