import { Hono } from 'hono'
import { prisma } from '../lib/prisma.js'
import { authMiddleware } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/admin.js'
import {
  createCategorySchema,
  updateCategorySchema,
} from '../utils/validation.js'

const categories = new Hono()

categories.get('/', authMiddleware, async c => {
  const cats = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { questions: true } },
    },
    orderBy: { name: 'asc' },
  })

  return c.json({
    categories: cats.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? undefined,
      questionCount: cat._count.questions,
    })),
  })
})

categories.post('/', requireAdmin, async c => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const existing = await prisma.category.findUnique({
    where: { slug: parsed.data.slug },
  })
  if (existing) {
    return c.json(
      { error: 'Conflict', message: 'Category with this slug already exists' },
      409,
    )
  }

  const category = await prisma.category.create({
    data: parsed.data,
    select: { id: true, name: true, slug: true, description: true },
  })

  return c.json({ ...category, questionCount: 0 }, 201)
})

categories.put('/:id', requireAdmin, async c => {
  const { id } = c.req.param()

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Bad Request', message: 'Invalid JSON body' }, 400)
  }

  const parsed = updateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    )
  }

  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing)
    return c.json({ error: 'Not Found', message: 'Category not found' }, 404)

  const category = await prisma.category.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { questions: true } },
    },
  })

  return c.json({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description ?? undefined,
    questionCount: category._count.questions,
  })
})

categories.delete('/:id', requireAdmin, async c => {
  const { id } = c.req.param()

  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing)
    return c.json({ error: 'Not Found', message: 'Category not found' }, 404)

  await prisma.category.delete({ where: { id } })
  return c.body(null, 204)
})

export default categories
