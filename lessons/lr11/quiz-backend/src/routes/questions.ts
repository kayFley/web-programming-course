import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { authMiddleware } from '../middleware/auth.js'
import {
  scoringService,
  type QuestionOption,
} from '../services/scoringService.js'

const questions = new Hono()

questions.use('*', authMiddleware)

questions.get('/', async c => {
  const settings = await prisma.appSettings.findUnique({
    where: { id: 'settings' },
  })
  const mode = settings?.mode ?? 'game'
  if (mode === 'battle') {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Questions are not available in Battle Mode',
      },
      403,
    )
  }

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
      select: {
        id: true,
        type: true,
        text: true,
        difficulty: true,
        categoryId: true,
        options: true,
        rubric: true,
        minLength: true,
        maxLength: true,
        category: { select: { name: true } },
      },
    }),
  ])

  return c.json({
    questions: rows.map(q => {
      const opts = q.options as QuestionOption[] | null
      const rub = q.rubric as Array<{ maxPoints: number }> | null
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
    }),
    total,
    limit: take,
    offset: skip,
  })
})

export default questions
