export interface QuestionOption {
  text: string
  points: number
  isCorrect: boolean
}

export interface ScoringBreakdown {
  correctSelected: number
  incorrectSelected: number
  pointsFromCorrect: number
  penaltyFromIncorrect: number
  totalBeforeMin: number
}

export interface MultipleSelectResult {
  score: number
  status: 'correct' | 'incorrect' | 'partial'
  correctOptions: number[]
  breakdown: ScoringBreakdown
}

export interface RubricScore {
  criterion: string
  earnedPoints: number
  maxPoints: number
  feedback?: string
}

export class ScoringService {
  scoreMultipleSelect(
    options: QuestionOption[],
    selectedIndices: number[],
    penaltyPerWrong: number = 0.5,
    minScore: number = 0,
  ): MultipleSelectResult {
    const correctOptions = options
      .map((opt, idx) => ({ ...opt, idx }))
      .filter(opt => opt.isCorrect)
      .map(opt => opt.idx)

    let pointsFromCorrect = 0
    let penaltyFromIncorrect = 0
    let correctSelected = 0
    let incorrectSelected = 0

    for (const idx of selectedIndices) {
      const option = options[idx]
      if (!option) continue
      if (option.isCorrect) {
        pointsFromCorrect += option.points
        correctSelected++
      } else {
        penaltyFromIncorrect += penaltyPerWrong
        incorrectSelected++
      }
    }

    const totalBeforeMin = pointsFromCorrect - penaltyFromIncorrect
    const score = Math.max(minScore, totalBeforeMin)

    const maxPossible = options
      .filter(o => o.isCorrect)
      .reduce((sum, o) => sum + o.points, 0)

    let status: 'correct' | 'incorrect' | 'partial'
    if (correctSelected === 0 || score === 0) {
      status = 'incorrect'
    } else if (
      correctSelected === correctOptions.length &&
      incorrectSelected === 0 &&
      score >= maxPossible
    ) {
      status = 'correct'
    } else {
      status = 'partial'
    }

    return {
      score,
      status,
      correctOptions,
      breakdown: {
        correctSelected,
        incorrectSelected,
        pointsFromCorrect,
        penaltyFromIncorrect,
        totalBeforeMin,
      },
    }
  }

  scoreEssay(rubricScores: RubricScore[]): number {
    return rubricScores.reduce((sum, item) => sum + item.earnedPoints, 0)
  }

  getMaxPoints(
    options?: QuestionOption[] | null,
    rubric?: Array<{ maxPoints: number }> | null,
  ): number {
    if (options && options.length > 0) {
      return options
        .filter(o => o.isCorrect)
        .reduce((sum, o) => sum + o.points, 0)
    }
    if (rubric && rubric.length > 0) {
      return rubric.reduce((sum, r) => sum + r.maxPoints, 0)
    }
    return 0
  }
}

export const scoringService = new ScoringService()
