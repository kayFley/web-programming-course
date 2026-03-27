import { prisma } from '../lib/prisma.js'
import {
  scoringService,
  type QuestionOption,
  type RubricScore,
} from './scoringService.js'

interface CreateSessionInput {
  userId: string
  mode: string
  categoryIds?: string[]
  difficulty?: string
  questionCount?: number
  battleConfig?: {
    questionCount?: number
    timeLimit?: number
    randomOrder?: boolean
  }
}

interface SubmitAnswerInput {
  sessionId: string
  userId: string
  questionId: string
  selectedOptions?: number[]
  text?: string
}

interface GradeEssayInput {
  answerId: string
  rubricScores: Array<{
    criterion: string
    earnedPoints: number
    maxPoints?: number
    feedback?: string
  }>
  generalFeedback?: string
}

export class SessionService {
  async createSession(input: CreateSessionInput) {
    const {
      userId,
      mode,
      categoryIds,
      difficulty,
      questionCount,
      battleConfig,
    } = input

    const effectiveQuestionCount =
      mode === 'battle'
        ? (battleConfig?.questionCount ?? 10)
        : (questionCount ?? 10)
    const effectiveDifficulty = difficulty
    const effectiveCategories = categoryIds

    const where: Record<string, unknown> = {}
    if (effectiveCategories && effectiveCategories.length > 0) {
      where['categoryId'] = { in: effectiveCategories }
    }
    if (effectiveDifficulty) {
      where['difficulty'] = effectiveDifficulty
    }

    const allQuestions = await prisma.question.findMany({
      where,
      select: { id: true },
    })

    if (allQuestions.length === 0) {
      throw new Error('No questions available for the given filters')
    }

    const shuffled = allQuestions.sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, effectiveQuestionCount).map(q => q.id)

    const timeLimit = mode === 'battle' ? (battleConfig?.timeLimit ?? 60) : 60
    const expiresAt = new Date(Date.now() + timeLimit * 60 * 1000)

    const session = await prisma.session.create({
      data: {
        userId,
        mode,
        status: 'active',
        expiresAt,
        questions: selected,
      },
    })

    return session
  }

  async submitAnswer(input: SubmitAnswerInput) {
    const { sessionId, userId, questionId, selectedOptions, text } = input

    return await prisma.$transaction(async tx => {
      const session = await tx.session.findUnique({ where: { id: sessionId } })
      if (!session) throw new Error('Session not found')
      if (session.userId !== userId) throw new Error('Forbidden')
      if (session.status !== 'active') throw new Error('Session is not active')
      if (new Date() > session.expiresAt) {
        await tx.session.update({
          where: { id: sessionId },
          data: { status: 'expired' },
        })
        throw new Error('Session has expired')
      }

      const questionIds = session.questions as string[]
      if (!questionIds.includes(questionId)) {
        throw new Error('Question is not part of this session')
      }

      const question = await tx.question.findUnique({
        where: { id: questionId },
      })
      if (!question) throw new Error('Question not found')

      const existing = await tx.answer.findUnique({
        where: { sessionId_questionId: { sessionId, questionId } },
      })
      if (existing) throw new Error('Question already answered')

      if (question.type === 'multiple-select') {
        if (!selectedOptions)
          throw new Error('selectedOptions required for multiple-select')

        const options = question.options as QuestionOption[] | null
        if (!options) throw new Error('Question has no options')

        const result = scoringService.scoreMultipleSelect(
          options,
          selectedOptions,
          question.penaltyPerWrong ?? 0.5,
          question.minScore ?? 0,
        )

        const answer = await tx.answer.create({
          data: {
            sessionId,
            questionId,
            userAnswer: selectedOptions,
            score: result.score,
            isCorrect: result.status === 'correct',
            status: result.status,
          },
        })

        return {
          type: 'result' as const,
          answerId: answer.id,
          questionId,
          status: result.status,
          pointsEarned: result.score,
          maxPoints: scoringService.getMaxPoints(options),
          correctOptions: result.correctOptions,
          breakdown: result.breakdown,
        }
      } else {
        if (!text) throw new Error('text required for essay')
        if (question.minLength && text.length < question.minLength) {
          throw new Error(
            `Answer too short (min ${question.minLength} characters)`,
          )
        }
        if (question.maxLength && text.length > question.maxLength) {
          throw new Error(
            `Answer too long (max ${question.maxLength} characters)`,
          )
        }

        const answer = await tx.answer.create({
          data: {
            sessionId,
            questionId,
            userAnswer: text,
            score: null,
            isCorrect: null,
            status: 'pending',
          },
        })

        return {
          type: 'pending' as const,
          answerId: answer.id,
          questionId,
          status: 'pending' as const,
          message: 'Essay answer saved. Awaiting manual review.',
        }
      }
    })
  }

  async submitSession(sessionId: string, userId: string) {
    return await prisma.$transaction(async tx => {
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        include: { answers: true },
      })
      if (!session) throw new Error('Session not found')
      if (session.userId !== userId) throw new Error('Forbidden')
      if (session.status === 'completed')
        throw new Error('Session already completed')
      if (session.status === 'expired') throw new Error('Session has expired')

      const gradedAnswers = session.answers.filter(a => a.score !== null)
      const totalScore = gradedAnswers.reduce(
        (sum, a) => sum + (a.score ?? 0),
        0,
      )

      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          score: totalScore,
          completedAt: new Date(),
        },
      })

      return updated
    })
  }

  async gradeEssay(input: GradeEssayInput, adminId: string) {
    return await prisma.$transaction(async tx => {
      const answer = await tx.answer.findUnique({
        where: { id: input.answerId },
        include: { session: true, question: true },
      })
      if (!answer) throw new Error('Answer not found')
      if (answer.question.type !== 'essay')
        throw new Error('Answer is not an essay')

      const rubricScoresWithDefaults = input.rubricScores.map(r => ({
        ...r,
        maxPoints: r.maxPoints ?? 0,
      }))
      const totalScore = scoringService.scoreEssay(rubricScoresWithDefaults)

      const updated = await tx.answer.update({
        where: { id: input.answerId },
        data: {
          score: totalScore,
          status: totalScore > 0 ? 'correct' : 'incorrect',
          feedback: input.generalFeedback ?? null,
          rubricScores: JSON.parse(JSON.stringify(input.rubricScores)),
        },
      })

      // Check if all answers in session are now graded
      const allAnswers = await tx.answer.findMany({
        where: { sessionId: answer.sessionId },
        select: { score: true },
      })
      const allGraded = allAnswers.every(a => a.score !== null)

      if (allGraded) {
        const total = allAnswers.reduce((sum, a) => sum + (a.score ?? 0), 0)
        await tx.session.update({
          where: { id: answer.sessionId },
          data: { score: total },
        })
      }

      void adminId // used by caller for audit logging if needed

      return updated
    })
  }
}

export const sessionService = new SessionService()
