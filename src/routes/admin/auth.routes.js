const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../middleware/asyncHandler');
const { ApiError } = require('../../middleware/errorHandler');
const { requireAdmin } = require('../../middleware/adminAuth');
const { createAdminSession, revokeAdminSession } = require('../../services/adminSessionService');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const username = typeof req.body.username === 'string'
    ? req.body.username.trim().toLowerCase()
    : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    throw new ApiError(400, 'Usuário e senha são obrigatórios.');
  }

  const adminUser = await prisma.adminUser.findUnique({ where: { username } });
  const validPassword = adminUser
    ? await bcrypt.compare(password, adminUser.passwordHash)
    : false;

  if (!adminUser || !adminUser.active || !validPassword) {
    throw new ApiError(401, 'Usuário ou senha inválidos.');
  }

  await prisma.adminSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const session = await createAdminSession(adminUser);
  res.json({
    ...session,
    admin: { id: adminUser.id, username: adminUser.username },
  });
}));

router.get('/session', requireAdmin, (req, res) => {
  res.json({
    authenticated: true,
    admin: { id: req.admin.id, username: req.admin.username },
    expiresAt: req.admin.expiresAt,
  });
});

router.post('/logout', requireAdmin, asyncHandler(async (req, res) => {
  await revokeAdminSession(req.admin.sessionId);
  res.status(204).send();
}));

module.exports = router;
