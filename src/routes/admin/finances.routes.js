const express = require('express');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../middleware/asyncHandler');
const { ApiError } = require('../../middleware/errorHandler');

const router = express.Router();

function parseDate(value, label) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, `${label} inválida.`);
  return date;
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'O valor deve ser maior que zero.');
  }
  return amount;
}

function transactionData(body) {
  const type = String(body.type || '').toUpperCase();
  const category = String(body.category || '').trim();
  const description = String(body.description || '').trim();
  const occurredAt = parseDate(body.occurredAt, 'Data da movimentação');

  if (!['INCOME', 'EXPENSE'].includes(type)) {
    throw new ApiError(400, 'Selecione uma movimentação de entrada ou saída.');
  }
  if (!category) throw new ApiError(400, 'A categoria é obrigatória.');
  if (!description) throw new ApiError(400, 'A descrição é obrigatória.');
  if (!occurredAt) throw new ApiError(400, 'A data da movimentação é obrigatória.');

  return {
    type,
    category,
    description,
    amount: parseAmount(body.amount),
    occurredAt,
    paymentMethod: String(body.paymentMethod || '').trim() || null,
    notes: String(body.notes || '').trim() || null,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const where = {};
  const from = parseDate(req.query.from, 'Data inicial');
  const to = parseDate(req.query.to, 'Data final');

  if (from || to) {
    where.occurredAt = {};
    if (from) where.occurredAt.gte = from;
    if (to) where.occurredAt.lt = to;
  }
  if (req.query.type) {
    const type = String(req.query.type).toUpperCase();
    if (!['INCOME', 'EXPENSE'].includes(type)) throw new ApiError(400, 'Tipo de movimentação inválido.');
    where.type = type;
  }
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.search) {
    const search = String(req.query.search).trim();
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  const periodWhere = {};
  if (where.occurredAt) periodWhere.occurredAt = where.occurredAt;

  const [items, total, income, expenses, categories] = await Promise.all([
    prisma.financialTransaction.findMany({
      where,
      include: {
        appointment: { include: { user: true, procedure: true } },
        adminUser: { select: { id: true, username: true } },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.financialTransaction.count({ where }),
    prisma.financialTransaction.aggregate({
      where: { ...periodWhere, type: 'INCOME' },
      _sum: { amount: true },
    }),
    prisma.financialTransaction.aggregate({
      where: { ...periodWhere, type: 'EXPENSE' },
      _sum: { amount: true },
    }),
    prisma.financialTransaction.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    }),
  ]);

  const incomeTotal = Number(income._sum.amount || 0);
  const expenseTotal = Number(expenses._sum.amount || 0);
  res.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    summary: { income: incomeTotal, expenses: expenseTotal, balance: incomeTotal - expenseTotal },
    categories: categories.map((item) => item.category),
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const transaction = await prisma.financialTransaction.create({
    data: { ...transactionData(req.body), adminUserId: req.admin.id },
  });
  res.status(201).json(transaction);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const current = await prisma.financialTransaction.findUnique({ where: { id: req.params.id } });
  if (!current) throw new ApiError(404, 'Movimentação não encontrada.');
  if (current.appointmentId) {
    throw new ApiError(400, 'Entradas de agendamentos devem ser alteradas no próprio agendamento.');
  }

  const transaction = await prisma.financialTransaction.update({
    where: { id: current.id },
    data: transactionData(req.body),
  });
  res.json(transaction);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const current = await prisma.financialTransaction.findUnique({ where: { id: req.params.id } });
  if (!current) throw new ApiError(404, 'Movimentação não encontrada.');
  if (current.appointmentId) {
    throw new ApiError(400, 'Entradas de agendamentos devem ser alteradas no próprio agendamento.');
  }

  await prisma.financialTransaction.delete({ where: { id: current.id } });
  res.status(204).end();
}));

module.exports = router;
