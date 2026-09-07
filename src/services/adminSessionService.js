const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { ApiError } = require('../middleware/errorHandler');

const SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 8);
const JWT_ISSUER = 'nail-scheduling-api';
const JWT_AUDIENCE = 'nail-admin-panel';

function getJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(500, 'Autenticação administrativa não configurada.');
  }
  return secret;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

async function createAdminSession(adminUser) {
  const apiKey = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  const session = await prisma.adminSession.create({
    data: {
      adminUserId: adminUser.id,
      apiKeyHash: hashApiKey(apiKey),
      expiresAt,
    },
  });

  const token = jwt.sign(
    { role: 'ADMIN', sid: session.id },
    getJwtSecret(),
    {
      subject: adminUser.id,
      expiresIn: `${SESSION_HOURS}h`,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  return { token, apiKey, expiresAt };
}

function verifyAdminToken(token) {
  try {
    return jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (error) {
    throw new ApiError(401, 'Sessão administrativa inválida ou expirada.');
  }
}

async function validateAdminSession(token, apiKey) {
  if (!token || !apiKey) {
    throw new ApiError(401, 'Autenticação administrativa obrigatória.');
  }

  const payload = verifyAdminToken(token);
  if (payload.role !== 'ADMIN' || !payload.sid || !payload.sub) {
    throw new ApiError(403, 'Acesso administrativo não autorizado.');
  }

  const session = await prisma.adminSession.findUnique({
    where: { id: payload.sid },
    include: { adminUser: true },
  });

  const isValid = session
    && session.adminUserId === payload.sub
    && session.adminUser.active
    && !session.revokedAt
    && session.expiresAt > new Date()
    && session.apiKeyHash === hashApiKey(apiKey);

  if (!isValid) {
    throw new ApiError(401, 'Sessão administrativa inválida ou expirada.');
  }

  return { session, adminUser: session.adminUser };
}

async function revokeAdminSession(sessionId) {
  await prisma.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = {
  createAdminSession,
  validateAdminSession,
  revokeAdminSession,
};
