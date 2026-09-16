const express = require('express');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../middleware/asyncHandler');
const { ApiError } = require('../../middleware/errorHandler');
const { normalizePhone, normalizeAnoNascimento, isValidPhone, isValidAnoNascimento } = require('../../utils/validators');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));
  const search = String(req.query.search || '').trim();
  const where = search ? {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search.replace(/\D/g, '') } },
    ],
  } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        appointments: {
          include: { procedure: true },
          orderBy: { startTime: 'desc' },
        },
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const now = new Date();
  const items = users.map(({ appointments, ...user }) => {
    const validAppointments = appointments.filter((item) => item.status !== 'CANCELLED');
    const previous = validAppointments
      .filter((item) => item.startTime < now)
      .sort((a, b) => b.startTime - a.startTime)[0] || null;
    const next = validAppointments
      .filter((item) => item.startTime >= now && item.status === 'SCHEDULED')
      .sort((a, b) => a.startTime - b.startTime)[0] || null;

    return {
      ...user,
      appointmentsCount: validAppointments.length,
      lastAppointment: previous,
      nextAppointment: next,
    };
  });

  res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, phone, anoNascimento, source } = req.body;
  if (!name || !phone || !anoNascimento) {
    throw new ApiError(400, 'Nome, telefone e ano de nascimento são obrigatórios.');
  }
  if (!isValidPhone(phone)) throw new ApiError(400, 'Telefone inválido.');
  if (!isValidAnoNascimento(anoNascimento)) throw new ApiError(400, 'Ano de nascimento inválido.');

  const normalizedPhone = normalizePhone(phone);
  const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (existing) throw new ApiError(409, 'Já existe um cliente com este telefone.');

  const user = await prisma.user.create({
    data: {
      name: String(name).trim(),
      phone: normalizedPhone,
      anoNascimento: normalizeAnoNascimento(anoNascimento),
      source: source ? String(source).trim() : 'Painel administrativo',
    },
  });

  res.status(201).json(user);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      appointments: {
        include: { procedure: true, anamnesis: true },
        orderBy: { startTime: 'desc' },
      },
    },
  });
  if (!user) throw new ApiError(404, 'Cliente não encontrado.');
  res.json(user);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.name !== undefined) data.name = String(req.body.name).trim() || null;
  if (req.body.source !== undefined) data.source = String(req.body.source).trim() || null;
  if (req.body.phone !== undefined) {
    if (!isValidPhone(req.body.phone)) throw new ApiError(400, 'Telefone inválido.');
    data.phone = normalizePhone(req.body.phone);
  }
  if (req.body.anoNascimento !== undefined) {
    if (!isValidAnoNascimento(req.body.anoNascimento)) throw new ApiError(400, 'Ano de nascimento inválido.');
    data.anoNascimento = normalizeAnoNascimento(req.body.anoNascimento);
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json(user);
}));

module.exports = router;
