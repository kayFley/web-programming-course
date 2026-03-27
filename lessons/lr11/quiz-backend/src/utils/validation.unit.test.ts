import { describe, it, expect } from 'vitest'
import {
  githubCallbackSchema,
  createSessionSchema,
  submitAnswerSchema,
  createQuestionSchema,
  gradeEssaySchema,
  updateProfileSchema,
  setDifficultySchema,
  updateModeSchema,
} from './validation.js'

describe('githubCallbackSchema', () => {
  it('accepts a non-empty code string', () => {
    expect(githubCallbackSchema.safeParse({ code: 'abc123' }).success).toBe(
      true,
    )
  })

  it('rejects empty string code', () => {
    const r = githubCallbackSchema.safeParse({ code: '' })
    expect(r.success).toBe(false)
  })

  it('rejects missing code field', () => {
    const r = githubCallbackSchema.safeParse({})
    expect(r.success).toBe(false)
  })

  it('rejects non-string code', () => {
    const r = githubCallbackSchema.safeParse({ code: 123 })
    expect(r.success).toBe(false)
  })
})

describe('updateProfileSchema', () => {
  it('accepts valid firstName and lastName', () => {
    expect(
      updateProfileSchema.safeParse({ firstName: 'Ivan', lastName: 'Petrov' })
        .success,
    ).toBe(true)
  })

  it('rejects empty firstName', () => {
    expect(
      updateProfileSchema.safeParse({ firstName: '', lastName: 'Petrov' })
        .success,
    ).toBe(false)
  })

  it('rejects missing lastName', () => {
    expect(updateProfileSchema.safeParse({ firstName: 'Ivan' }).success).toBe(
      false,
    )
  })
})

describe('createSessionSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(createSessionSchema.safeParse({}).success).toBe(true)
  })

  it('accepts all optional fields with valid values', () => {
    expect(
      createSessionSchema.safeParse({
        categoryIds: ['cat-1'],
        difficulty: 'hard',
        questionCount: 5,
      }).success,
    ).toBe(true)
  })

  it('rejects invalid difficulty value', () => {
    const r = createSessionSchema.safeParse({ difficulty: 'extreme' })
    expect(r.success).toBe(false)
  })

  it('rejects questionCount below minimum (1)', () => {
    const r = createSessionSchema.safeParse({ questionCount: 0 })
    expect(r.success).toBe(false)
  })

  it('rejects questionCount above maximum (100)', () => {
    const r = createSessionSchema.safeParse({ questionCount: 101 })
    expect(r.success).toBe(false)
  })

  it('rejects non-integer questionCount', () => {
    const r = createSessionSchema.safeParse({ questionCount: 5.5 })
    expect(r.success).toBe(false)
  })
})

describe('submitAnswerSchema', () => {
  it('accepts valid questionId with selectedOptions', () => {
    expect(
      submitAnswerSchema.safeParse({
        questionId: 'q-1',
        selectedOptions: [0, 2],
      }).success,
    ).toBe(true)
  })

  it('accepts valid questionId with text (essay)', () => {
    expect(
      submitAnswerSchema.safeParse({ questionId: 'q-1', text: 'My answer' })
        .success,
    ).toBe(true)
  })

  it('rejects missing questionId', () => {
    const r = submitAnswerSchema.safeParse({ selectedOptions: [0] })
    expect(r.success).toBe(false)
  })

  it('rejects empty questionId', () => {
    const r = submitAnswerSchema.safeParse({ questionId: '' })
    expect(r.success).toBe(false)
  })

  it('rejects negative selectedOptions indices', () => {
    const r = submitAnswerSchema.safeParse({
      questionId: 'q-1',
      selectedOptions: [-1],
    })
    expect(r.success).toBe(false)
  })

  it('rejects float selectedOptions indices', () => {
    const r = submitAnswerSchema.safeParse({
      questionId: 'q-1',
      selectedOptions: [0.5],
    })
    expect(r.success).toBe(false)
  })
})

describe('createQuestionSchema', () => {
  const baseMultiple = {
    type: 'multiple-select' as const,
    question: 'Which of the following are correct?',
    difficulty: 'easy' as const,
    categoryId: 'cat-1',
    options: [
      { text: 'Option A', points: 1, isCorrect: true },
      { text: 'Option B', points: 0, isCorrect: false },
    ],
  }

  it('accepts valid multiple-select question', () => {
    expect(createQuestionSchema.safeParse(baseMultiple).success).toBe(true)
  })

  it('accepts valid essay question', () => {
    expect(
      createQuestionSchema.safeParse({
        type: 'essay',
        question: 'Explain the concept of closures in JavaScript.',
        difficulty: 'medium',
        categoryId: 'cat-1',
        minLength: 50,
        maxLength: 500,
      }).success,
    ).toBe(true)
  })

  it('rejects question text shorter than 10 characters', () => {
    const r = createQuestionSchema.safeParse({
      ...baseMultiple,
      question: 'Too short',
    })
    expect(r.success).toBe(false)
  })

  it('rejects invalid type', () => {
    const r = createQuestionSchema.safeParse({
      ...baseMultiple,
      type: 'single',
    })
    expect(r.success).toBe(false)
  })

  it('rejects invalid difficulty', () => {
    const r = createQuestionSchema.safeParse({
      ...baseMultiple,
      difficulty: 'nightmare',
    })
    expect(r.success).toBe(false)
  })

  it('rejects option with negative points', () => {
    const r = createQuestionSchema.safeParse({
      ...baseMultiple,
      options: [{ text: 'A', points: -1, isCorrect: true }],
    })
    expect(r.success).toBe(false)
  })
})

describe('gradeEssaySchema', () => {
  it('accepts valid rubricScores array', () => {
    expect(
      gradeEssaySchema.safeParse({
        rubricScores: [{ criterion: 'Accuracy', earnedPoints: 4 }],
      }).success,
    ).toBe(true)
  })

  it('accepts empty rubricScores array', () => {
    expect(gradeEssaySchema.safeParse({ rubricScores: [] }).success).toBe(true)
  })

  it('accepts optional generalFeedback', () => {
    expect(
      gradeEssaySchema.safeParse({
        rubricScores: [],
        generalFeedback: 'Good work',
      }).success,
    ).toBe(true)
  })

  it('rejects missing rubricScores', () => {
    const r = gradeEssaySchema.safeParse({})
    expect(r.success).toBe(false)
  })

  it('rejects negative earnedPoints', () => {
    const r = gradeEssaySchema.safeParse({
      rubricScores: [{ criterion: 'X', earnedPoints: -1 }],
    })
    expect(r.success).toBe(false)
  })

  it('rejects empty criterion string', () => {
    const r = gradeEssaySchema.safeParse({
      rubricScores: [{ criterion: '', earnedPoints: 0 }],
    })
    expect(r.success).toBe(false)
  })
})

describe('setDifficultySchema', () => {
  it('accepts valid difficulty', () => {
    expect(setDifficultySchema.safeParse({ difficulty: 'easy' }).success).toBe(
      true,
    )
  })

  it('rejects missing difficulty (required field)', () => {
    expect(setDifficultySchema.safeParse({}).success).toBe(false)
  })
})
