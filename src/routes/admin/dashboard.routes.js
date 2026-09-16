const express = require('express');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();
const TIMEZONE = process.env.CALENDAR_TIMEZONE || 'America/Sao_Paulo';

function getLocalDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function rangeForDate(dateString) {
  const start = new Date(`${dateString}T00:00:00-03:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

router.get('/', asyncHandler(async (_req, res) => {
  const now = new Date();
  const { start: todayStart, end: todayEnd } = rangeForDate(getLocalDateString(now));
  const weekday = new Date(`${getLocalDateString(now)}T12:00:00-03:00`).getUTCDay();
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - ((weekday + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const recentCancellationStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(`${getLocalDateString(now).slice(0, 7)}-01T00:00:00-03:00`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const activeStatuses = ['SCHEDULED', 'COMPLETED'];
  const [todayCount, weekCount, clientsCount, pendingCount, cancellationsCount, nextToday, monthIncome, monthExpenses] = await Promise.all([
    prisma.appointment.count({
      where: { startTime: { gte: todayStart, lt: todayEnd }, status: { in: activeStatuses } },
    }),
    prisma.appointment.count({
      where: { startTime: { gte: weekStart, lt: weekEnd }, status: { in: activeStatuses } },
    }),
    prisma.user.count(),
    prisma.appointment.count({ where: { status: 'SCHEDULED', confirmedAt: null } }),
    prisma.appointment.count({ where: { status: 'CANCELLED', cancelledAt: { gte: recentCancellationStart } } }),
    prisma.appointment.findMany({
      where: { status: 'SCHEDULED', startTime: { gte: now, lt: todayEnd } },
      include: { user: true, procedure: true },
      orderBy: { startTime: 'asc' },
      take: 8,
    }),
    prisma.financialTransaction.aggregate({
      where: { type: 'INCOME', occurredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.financialTransaction.aggregate({
      where: { type: 'EXPENSE', occurredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
  ]);

  const incomeTotal = Number(monthIncome._sum.amount || 0);
  const expenseTotal = Number(monthExpenses._sum.amount || 0);

  res.json({
    metrics: {
      todayAppointments: todayCount,
      weekAppointments: weekCount,
      clients: clientsCount,
      pendingConfirmation: pendingCount,
      recentCancellations: cancellationsCount,
      nextAppointments: nextToday.length,
      monthIncome: incomeTotal,
      monthExpenses: expenseTotal,
      monthBalance: incomeTotal - expenseTotal,
    },
    nextToday,
  });
}));

module.exports = router;
