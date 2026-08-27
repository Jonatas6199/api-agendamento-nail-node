const express = require('express');
const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { hasRecentAnamnesis, hasPreviousAppointments } = require('../services/anamnesisService');

const router = express.Router();

// GET /api/users/:id - retorna dados do usuário
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new ApiError(404, 'Usuário não encontrado.');
    res.json(user);
  })
);

// PATCH /api/users/:id - atualiza campos opcionais (nome, origem)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, source } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (source !== undefined) data.source = source;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
    });

    res.json(user);
  })
);

// GET /api/users/:userId/anamnesis-status
router.get('/:id/anamnesis-status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!user) throw new ApiError(404, 'Usuário não encontrado.');

  const [hasRecent, hasPrevious] = await Promise.all([
    hasRecentAnamnesis(id),
    hasPreviousAppointments(id),
  ]);

  return res.json({
    userId: id,
    isAnamnesisRequired: !hasRecent,
    hasPreviousAppointments: hasPrevious,
    isFirstVisit: !hasPrevious,
  });
}));

module.exports = router;
