const express = require('express');
const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

// GET /api/procedures - lista procedimentos ativos com valor e tempo médio
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const procedures = await prisma.procedure.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    res.json(procedures);
  })
);

module.exports = router;
