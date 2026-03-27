import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const dbUrl = process.env['DATABASE_URL'] ?? 'file:./prisma/dev.db'

const adapter = new PrismaLibSql({ url: dbUrl })

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
