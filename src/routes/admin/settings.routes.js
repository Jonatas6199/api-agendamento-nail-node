const express = require('express');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../middleware/asyncHandler');
const { ApiError } = require('../../middleware/errorHandler');

const router = express.Router();
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get('/', asyncHandler(async (_req, res) => {
  const [procedures, workingHours, blockedDates] = await Promise.all([
    prisma.procedure.findMany({ orderBy: { name: 'asc' } }),
    prisma.workingHours.findMany({ orderBy: { weekday: 'asc' } }),
    prisma.blockedDate.findMany({ orderBy: { date: 'asc' } }),
  ]);

  res.json({
    business: {
      name: process.env.BUSINESS_NAME || 'Studio Nail Design',
      tagline: process.env.BUSINESS_TAGLINE || 'Estética & Nail Design',
      whatsappNumber: process.env.WHATSAPP_NUMBER || null,
      reviewUrl: process.env.BUSINESS_REVIEW_URL || null,
      signalPercentage: Number(process.env.SIGNAL_PERCENTAGE || 0.3),
    },
    procedures,
    workingHours,
    blockedDates,
  });
}));

router.post('/procedures', asyncHandler(async (req, res) => {
  const { name, price, durationMin, description, active = true } = req.body;
  if (!name || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(durationMin)) || Number(durationMin) <= 0) {
    throw new ApiError(400, 'Nome, preço e duração válidos são obrigatórios.');
  }

  const procedure = await prisma.procedure.create({
    data: {
      name: String(name).trim(),
      price: Number(price),
      durationMin: Number(durationMin),
      description: description || null,
      active: Boolean(active),
    },
  });
  res.status(201).json(procedure);
}));

router.patch('/procedures/:id', asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.name !== undefined) data.name = String(req.body.name).trim();
  if (req.body.price !== undefined) {
    if (!Number.isFinite(Number(req.body.price)) || Number(req.body.price) < 0) throw new ApiError(400, 'Preço inválido.');
    data.price = Number(req.body.price);
  }
  if (req.body.durationMin !== undefined) {
    if (!Number.isInteger(Number(req.body.durationMin)) || Number(req.body.durationMin) <= 0) throw new ApiError(400, 'Duração inválida.');
    data.durationMin = Number(req.body.durationMin);
  }
  if (req.body.description !== undefined) data.description = req.body.description || null;
  if (req.body.active !== undefined) data.active = Boolean(req.body.active);

  res.json(await prisma.procedure.update({ where: { id: req.params.id }, data }));
}));

router.put('/working-hours/:weekday', asyncHandler(async (req, res) => {
  const weekday = Number(req.params.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new ApiError(400, 'Dia da semana inválido.');

  const { startTime, endTime, lunchStartTime, lunchEndTime, active = true } = req.body;
  const times = [startTime, endTime, lunchStartTime, lunchEndTime].filter(Boolean);
  if (times.some((time) => !TIME_PATTERN.test(time))) throw new ApiError(400, 'Horário inválido. Use HH:mm.');
  if (!startTime || !endTime || startTime >= endTime) throw new ApiError(400, 'Início e fim do expediente são obrigatórios e devem ser válidos.');
  if ((lunchStartTime && !lunchEndTime) || (!lunchStartTime && lunchEndTime)) throw new ApiError(400, 'Informe o início e o fim do intervalo.');

  const data = {
    weekday,
    startTime,
    endTime,
    lunchStartTime: lunchStartTime || null,
    lunchEndTime: lunchEndTime || null,
    active: Boolean(active),
  };
  const item = await prisma.workingHours.upsert({
    where: { weekday },
    update: data,
    create: data,
  });
  res.json(item);
}));

router.post('/blocked-dates', asyncHandler(async (req, res) => {
  const date = new Date(`${req.body.date}T00:00:00`);
  if (!req.body.date || Number.isNaN(date.getTime())) throw new ApiError(400, 'Data inválida.');
  const blocked = await prisma.blockedDate.create({
    data: { date, reason: req.body.reason ? String(req.body.reason).trim() : null },
  });
  res.status(201).json(blocked);
}));

router.delete('/blocked-dates/:id', asyncHandler(async (req, res) => {
  await prisma.blockedDate.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

module.exports = router;
