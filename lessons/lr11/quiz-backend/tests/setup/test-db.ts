import { PrismaClient } from '../../src/generated/prisma/client.js'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { sign } from 'hono/jwt'

const dbUrl = process.env['DATABASE_URL'] ?? 'file:./dev.db'
const adapter = new PrismaLibSql({ url: dbUrl })
export const testPrisma = new PrismaClient({ adapter })

const JWT_SECRET =
  process.env['JWT_SECRET'] ?? 'your-secret-key-change-in-production'

export async function makeToken(userId: string): Promise<string> {
  return sign(
    { userId, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET,
  )
}

export async function createTestUser(suffix: string, role: 'student' | 'admin' = 'student') {
  return testPrisma.user.create({
    data: {
      githubId: `test_ghid_${suffix}`,
      githubUsername: `test_user_${suffix}`,
      name: `Test User ${suffix}`,
      email: `test_${suffix}@vitest.local`,
      avatarUrl: 'https://example.com/avatar.png',
      role,
    },
  })
}

export async function cleanupUser(userId: string) {
  await testPrisma.session.deleteMany({ where: { userId } })
  await testPrisma.user.deleteMany({ where: { id: userId } })
}

export async function ensureAppSettings() {
  await testPrisma.appSettings.upsert({
    where: { id: 'settings' },
    update: {},
    create: { id: 'settings', mode: 'game' },
  })
}
