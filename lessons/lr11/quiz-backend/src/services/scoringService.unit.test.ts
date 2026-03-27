import { describe, it, expect } from 'vitest'
import { ScoringService } from './scoringService.js'

const scoring = new ScoringService()

const opts = [
  { text: 'A', points: 2, isCorrect: true },
  { text: 'B', points: 3, isCorrect: true },
  { text: 'C', points: 0, isCorrect: false },
  { text: 'D', points: 0, isCorrect: false },
]

describe('ScoringService.scoreMultipleSelect', () => {
  it('all correct selected → full points, status correct', () => {
    const r = scoring.scoreMultipleSelect(opts, [0, 1])
    expect(r.score).toBe(5)
    expect(r.status).toBe('correct')
    expect(r.breakdown.correctSelected).toBe(2)
    expect(r.breakdown.incorrectSelected).toBe(0)
  })

  it('only wrong options → 0 points, status incorrect', () => {
    const r = scoring.scoreMultipleSelect(opts, [2, 3])
    expect(r.score).toBe(0)
    expect(r.status).toBe('incorrect')
    expect(r.breakdown.incorrectSelected).toBe(2)
  })

  it('mix of correct and wrong → partial with penalty', () => {
    const r = scoring.scoreMultipleSelect(opts, [0, 2], 0.5)
    expect(r.score).toBe(1.5)
    expect(r.status).toBe('partial')
    expect(r.breakdown.pointsFromCorrect).toBe(2)
    expect(r.breakdown.penaltyFromIncorrect).toBe(0.5)
    expect(r.breakdown.totalBeforeMin).toBe(1.5)
  })

  it('penalty cannot push score below minScore', () => {
    const r = scoring.scoreMultipleSelect(opts, [2, 3], 10, 0)
    expect(r.score).toBe(0)
  })

  it('empty selection → 0 points, status incorrect', () => {
    const r = scoring.scoreMultipleSelect(opts, [])
    expect(r.score).toBe(0)
    expect(r.status).toBe('incorrect')
  })

  it('returns correct indices for correctOptions', () => {
    const r = scoring.scoreMultipleSelect(opts, [0])
    expect(r.correctOptions).toEqual([0, 1])
  })

  it('breakdown accurate for partial selection with wrong answer', () => {
    const r = scoring.scoreMultipleSelect(opts, [0, 1, 2], 0.5)
    expect(r.breakdown.correctSelected).toBe(2)
    expect(r.breakdown.incorrectSelected).toBe(1)
    expect(r.breakdown.pointsFromCorrect).toBe(5)
    expect(r.breakdown.penaltyFromIncorrect).toBe(0.5)
    expect(r.score).toBe(4.5)
  })

  it('single correct option → partial (not all correct chosen)', () => {
    const r = scoring.scoreMultipleSelect(opts, [0])
    expect(r.score).toBe(2)
    expect(r.status).toBe('partial')
  })

  it('penaltyPerWrong=1 reduces score by 1 per wrong answer', () => {
    const r = scoring.scoreMultipleSelect(opts, [1, 2, 3], 1)
    expect(r.score).toBe(1) // 3 - 1 - 1
    expect(r.breakdown.penaltyFromIncorrect).toBe(2)
  })

  it('minScore floors result upward when set high', () => {
    const r = scoring.scoreMultipleSelect(opts, [0], 0, 5)
    expect(r.score).toBe(5)
  })

  it('out-of-bounds index is silently ignored', () => {
    const r = scoring.scoreMultipleSelect(opts, [99])
    expect(r.score).toBe(0)
    expect(r.status).toBe('incorrect')
  })
})

describe('ScoringService.scoreEssay', () => {
  it('full marks → sum of all earnedPoints', () => {
    expect(
      scoring.scoreEssay([
        { criterion: 'A', earnedPoints: 3, maxPoints: 3 },
        { criterion: 'B', earnedPoints: 5, maxPoints: 5 },
      ]),
    ).toBe(8)
  })

  it('partial marks → correct partial sum', () => {
    expect(
      scoring.scoreEssay([
        { criterion: 'A', earnedPoints: 2, maxPoints: 5 },
        { criterion: 'B', earnedPoints: 1, maxPoints: 3 },
      ]),
    ).toBe(3)
  })

  it('all zero earned → returns 0', () => {
    expect(
      scoring.scoreEssay([
        { criterion: 'A', earnedPoints: 0, maxPoints: 5 },
        { criterion: 'B', earnedPoints: 0, maxPoints: 3 },
      ]),
    ).toBe(0)
  })

  it('empty rubric → returns 0', () => {
    expect(scoring.scoreEssay([])).toBe(0)
  })

  it('feedback field does not affect score', () => {
    expect(
      scoring.scoreEssay([
        { criterion: 'A', earnedPoints: 5, maxPoints: 5, feedback: 'Great!' },
        { criterion: 'B', earnedPoints: 3, maxPoints: 5, feedback: 'OK' },
      ]),
    ).toBe(8)
  })

  it('three criteria with mixed scores', () => {
    expect(
      scoring.scoreEssay([
        { criterion: 'X', earnedPoints: 4, maxPoints: 5 },
        { criterion: 'Y', earnedPoints: 3, maxPoints: 5 },
        { criterion: 'Z', earnedPoints: 2, maxPoints: 5 },
      ]),
    ).toBe(9)
  })
})

describe('ScoringService.getMaxPoints', () => {
  it('calculates max from correct options only', () => {
    expect(scoring.getMaxPoints(opts)).toBe(5)
  })

  it('calculates max from rubric when options null', () => {
    expect(
      scoring.getMaxPoints(null, [{ maxPoints: 5 }, { maxPoints: 3 }]),
    ).toBe(8)
  })

  it('options take priority over rubric when both present', () => {
    expect(scoring.getMaxPoints(opts, [{ maxPoints: 99 }])).toBe(5)
  })

  it('null options and null rubric → 0', () => {
    expect(scoring.getMaxPoints(null, null)).toBe(0)
  })

  it('empty options array falls through to rubric', () => {
    expect(scoring.getMaxPoints([], [{ maxPoints: 7 }])).toBe(7)
  })
})
