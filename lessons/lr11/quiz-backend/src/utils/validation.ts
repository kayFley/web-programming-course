import { z } from 'zod'

export const githubCallbackSchema = z.object({
  code: z.string().min(1, 'GitHub authorization code is required'),
})

export const updateProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
})

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
})

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(500).optional(),
})

export const questionOptionSchema = z.object({
  text: z.string().min(1),
  points: z.number().min(0),
  isCorrect: z.boolean(),
})

export const essayRubricItemSchema = z.object({
  criterion: z.string().min(1),
  maxPoints: z.number().min(1),
  description: z.string().optional(),
})

export const createQuestionSchema = z.object({
  type: z.enum(['multiple-select', 'essay']),
  question: z.string().min(10).max(1000),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  categoryId: z.string().min(1),
  options: z.array(questionOptionSchema).min(2).optional(),
  penaltyPerWrong: z.number().min(0).optional(),
  minScore: z.number().optional(),
  minLength: z.number().min(1).optional(),
  maxLength: z.number().min(1).optional(),
  rubric: z.array(essayRubricItemSchema).optional(),
})

export const updateQuestionSchema = z.object({
  question: z.string().min(10).max(1000).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  categoryId: z.string().optional(),
  options: z.array(questionOptionSchema).optional(),
  penaltyPerWrong: z.number().min(0).optional(),
  minScore: z.number().optional(),
  minLength: z.number().min(1).optional(),
  maxLength: z.number().min(1).optional(),
  rubric: z.array(essayRubricItemSchema).optional(),
})

export const createSessionSchema = z.object({
  categoryIds: z.array(z.string()).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  questionCount: z.number().int().min(1).max(100).optional(),
})

export const submitAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptions: z.array(z.number().int().min(0)).optional(),
  text: z.string().optional(),
})

export const gradeEssaySchema = z.object({
  rubricScores: z.array(
    z.object({
      criterion: z.string().min(1),
      earnedPoints: z.number().min(0),
      feedback: z.string().optional(),
    }),
  ),
  generalFeedback: z.string().optional(),
})

export const setDifficultySchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionCount: z.number().int().min(1).max(100).optional(),
  categoryIds: z.array(z.string()).optional(),
})

export const updateModeSchema = z.object({
  mode: z.enum(['game', 'battle']),
  battleConfig: z
    .object({
      questionCount: z.number().int().min(1).max(100).optional(),
      timeLimit: z.number().int().min(1).max(300).optional(),
      allowedAttempts: z.number().int().min(1).optional(),
      randomOrder: z.boolean().optional(),
      showResultsImmediately: z.boolean().optional(),
    })
    .optional(),
})

export type GithubCallbackInput = z.infer<typeof githubCallbackSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>
export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>
export type GradeEssayInput = z.infer<typeof gradeEssaySchema>
export type SetDifficultyInput = z.infer<typeof setDifficultySchema>
export type UpdateModeInput = z.infer<typeof updateModeSchema>
