const express = require('express');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../middleware/asyncHandler');
const { ApiError } = require('../../middleware/errorHandler');
const appointmentService = require('../../services/adminAppointmentService');

const router = express.Router();

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${label} inválida.`);
  return date;
}

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const where = {};
  const from = parseDate(req.query.from, 'Data inicial');
  const to = parseDate(req.query.to, 'Data final');

  if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = from;
    if (to) where.startTime.lt = to;
  }

  if (req.query.status) {
    const statuses = String(req.query.status).split(',').filter(Boolean);
    where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  }
  if (req.query.pending === 'true') {
    where.status = 'SCHEDULED';
    where.confirmedAt = null;
  }
  if (req.query.confirmed === 'true') {
    where.status = 'SCHEDULED';
    where.confirmedAt = { not: null };
  }
  if (req.query.search) {
    const search = String(req.query.search).trim();
    where.OR = [
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { user: { phone: { contains: search } } },
      { procedure: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: { user: true, procedure: true, anamnesis: true },
      orderBy: { startTime: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.appointment.count({ where }),
  ]);

  res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const appointment = await appointmentService.createAdminAppointment(req.body);
  res.status(201).json(appointment);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { user: true, procedure: true, anamnesis: true },
  });
  if (!appointment) throw new ApiError(404, 'Agendamento não encontrado.');
  res.json(appointment);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  res.json(await appointmentService.updateAdminAppointment(req.params.id, req.body));
}));

router.patch('/:id/reschedule', asyncHandler(async (req, res) => {
  res.json(await appointmentService.rescheduleAdminAppointment(req.params.id, req.body.startTime));
}));

router.patch('/:id/confirm', asyncHandler(async (req, res) => {
  res.json(await appointmentService.confirmAdminAppointment(req.params.id, req.body));
}));

router.patch('/:id/complete', asyncHandler(async (req, res) => {
  res.json(await appointmentService.completeAdminAppointment(req.params.id));
}));

router.patch('/:id/cancel', asyncHandler(async (req, res) => {
  res.json(await appointmentService.cancelAdminAppointment(req.params.id));
}));

module.exports = router;
