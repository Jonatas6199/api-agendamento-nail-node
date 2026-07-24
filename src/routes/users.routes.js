const express = require('express');
const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

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

module.exports = router;
