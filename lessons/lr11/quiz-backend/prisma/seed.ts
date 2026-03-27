import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const dbUrl = process.env['DATABASE_URL'] ?? 'file:./dev.db'
const adapter = new PrismaLibSql({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.answer.deleteMany()
  await prisma.session.deleteMany()
  await prisma.question.deleteMany()
  await prisma.category.deleteMany()

  const js = await prisma.category.upsert({
    where: { slug: 'javascript' },
    update: {},
    create: {
      name: 'JavaScript',
      slug: 'javascript',
      description: 'Основы JavaScript',
    },
  })

  const ts = await prisma.category.upsert({
    where: { slug: 'typescript' },
    update: {},
    create: {
      name: 'TypeScript',
      slug: 'typescript',
      description: 'Типизация в TypeScript',
    },
  })

  const react = await prisma.category.upsert({
    where: { slug: 'react' },
    update: {},
    create: { name: 'React', slug: 'react', description: 'Библиотека React' },
  })

  await prisma.question.createMany({
    data: [
      {
        text: 'Какие из перечисленных методов являются методами массива в JavaScript?123',
        type: 'multiple-select',
        difficulty: 'easy',
        categoryId: js.id,
        options: [
          { text: 'map()', points: 1, isCorrect: true },
          { text: 'filter()', points: 1, isCorrect: true },
          { text: 'reduce()', points: 1, isCorrect: true },
          { text: 'compute()', points: 0, isCorrect: false },
          { text: 'flatten()', points: 0, isCorrect: false },
        ],
        penaltyPerWrong: 0.5,
        minScore: 0,
      },
      {
        text: 'Что из перечисленного относится к примитивным типам в JavaScript?1234',
        type: 'multiple-select',
        difficulty: 'easy',
        categoryId: js.id,
        options: [
          { text: 'string', points: 1, isCorrect: true },
          { text: 'number', points: 1, isCorrect: true },
          { text: 'boolean', points: 1, isCorrect: true },
          { text: 'null', points: 1, isCorrect: true },
          { text: 'object', points: 0, isCorrect: false },
          { text: 'array', points: 0, isCorrect: false },
        ],
        penaltyPerWrong: 0.5,
        minScore: 0,
      },
      {
        text: 'Какие из следующих утверждений о Promise верны?124',
        type: 'multiple-select',
        difficulty: 'medium',
        categoryId: js.id,
        options: [
          {
            text: 'Promise может находиться в состоянии pending, fulfilled или rejected',
            points: 1,
            isCorrect: true,
          },
          {
            text: 'Promise.all() ждёт выполнения всех промисов',
            points: 1,
            isCorrect: true,
          },
          {
            text: 'Promise можно отменить встроенными средствами',
            points: 0,
            isCorrect: false,
          },
          {
            text: 'async/await — синтаксический сахар над Promise',
            points: 1,
            isCorrect: true,
          },
        ],
        penaltyPerWrong: 0.5,
        minScore: 0,
      },
      {
        text: 'Какие утверждения о TypeScript верны?124',
        type: 'multiple-select',
        difficulty: 'easy',
        categoryId: ts.id,
        options: [
          {
            text: 'TypeScript — надмножество JavaScript',
            points: 1,
            isCorrect: true,
          },
          {
            text: 'TypeScript компилируется в JavaScript',
            points: 1,
            isCorrect: true,
          },
          {
            text: 'TypeScript выполняется напрямую в браузере',
            points: 0,
            isCorrect: false,
          },
          {
            text: 'TypeScript поддерживает дженерики',
            points: 1,
            isCorrect: true,
          },
        ],
        penaltyPerWrong: 0.5,
        minScore: 0,
      },
      {
        text: 'Какие из перечисленных типов существуют в TypeScript?1235',
        type: 'multiple-select',
        difficulty: 'medium',
        categoryId: ts.id,
        options: [
          { text: 'unknown', points: 1, isCorrect: true },
          { text: 'never', points: 1, isCorrect: true },
          { text: 'any', points: 1, isCorrect: true },
          { text: 'maybe', points: 0, isCorrect: false },
          { text: 'void', points: 1, isCorrect: true },
        ],
        penaltyPerWrong: 0.5,
        minScore: 0,
      },
      {
        text: 'Какие хуки являются встроенными в React?1235',
        type: 'multiple-select',
        difficulty: 'easy',
        categoryId: react.id,
        options: [
          { text: 'useState', points: 1, isCorrect: true },
          { text: 'useEffect', points: 1, isCorrect: true },
          { text: 'useContext', points: 1, isCorrect: true },
          { text: 'useDatabase', points: 0, isCorrect: false },
          { text: 'useReducer', points: 1, isCorrect: true },
        ],
        penaltyPerWrong: 0.5,
        minScore: 0,
      },
      {
        text: 'Что из перечисленного верно относительно useEffect?123',
        type: 'multiple-select',
        difficulty: 'medium',
        categoryId: react.id,
        options: [
          {
            text: 'Выполняется после рендера компонента',
            points: 1,
            isCorrect: true,
          },
          {
            text: 'Может возвращать функцию очистки',
            points: 1,
            isCorrect: true,
          },
          {
            text: 'Пустой массив зависимостей означает запуск только при монтировании',
            points: 1,
            isCorrect: true,
          },
          {
            text: 'Выполняется до рендера компонента',
            points: 0,
            isCorrect: false,
          },
        ],
        penaltyPerWrong: 0.5,
        minScore: 0,
      },
    ],
  })

  await prisma.question.createMany({
    data: [
      {
        text: 'Объясните разницу между var, let и const в JavaScript. Когда следует использовать каждый из них?',
        type: 'essay',
        difficulty: 'medium',
        categoryId: js.id,
        minLength: 100,
        maxLength: 1000,
        rubric: [
          {
            criterion:
              'Область видимости (var — функциональная, let/const — блочная)',
            maxPoints: 3,
          },
          { criterion: 'Поднятие переменных (hoisting)', maxPoints: 2 },
          {
            criterion: 'Переназначение (const нельзя переназначить)',
            maxPoints: 2,
          },
          {
            criterion: 'Практические рекомендации по использованию',
            maxPoints: 3,
          },
        ],
      },
      {
        text: 'Что такое замыкание (closure) в JavaScript? Приведите пример и объясните практическое применение.',
        type: 'essay',
        difficulty: 'hard',
        categoryId: js.id,
        minLength: 150,
        maxLength: 1500,
        rubric: [
          { criterion: 'Правильное определение замыкания', maxPoints: 3 },
          { criterion: 'Корректный пример кода', maxPoints: 3 },
          { criterion: 'Практические случаи использования', maxPoints: 4 },
        ],
      },
      {
        text: 'Опишите разницу между interface и type в TypeScript. В каких случаях предпочтительнее использовать каждый из них?',
        type: 'essay',
        difficulty: 'medium',
        categoryId: ts.id,
        minLength: 100,
        maxLength: 1000,
        rubric: [
          { criterion: 'Различия в синтаксисе и возможностях', maxPoints: 4 },
          { criterion: 'Расширение (extends vs &)', maxPoints: 3 },
          { criterion: 'Рекомендации по применению', maxPoints: 3 },
        ],
      },
      {
        text: 'Объясните концепцию виртуального DOM в React. Как он работает и зачем нужен?',
        type: 'essay',
        difficulty: 'medium',
        categoryId: react.id,
        minLength: 100,
        maxLength: 1000,
        rubric: [
          { criterion: 'Что такое виртуальный DOM', maxPoints: 3 },
          {
            criterion: 'Процесс reconciliation (сравнения и обновления)',
            maxPoints: 4,
          },
          {
            criterion: 'Преимущества перед прямой работой с реальным DOM',
            maxPoints: 3,
          },
        ],
      },
    ],
  })

  const total = await prisma.question.count()
  console.log(`Создано категорий: 3, вопросов в БД: ${total}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
