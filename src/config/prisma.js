const { PrismaClient } = require('@prisma/client');

// Evita múltiplas instâncias do PrismaClient em ambiente de dev com hot-reload
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
