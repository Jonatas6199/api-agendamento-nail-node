const express = require('express');
const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { normalizePhone, normalizeCpf, isValidCPF, isValidPhone } = require('../utils/validators');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { phone, cpf, name?, source? }
 *
 * Regra:
 * - Se o telefone já existe, o CPF enviado precisa bater com o cadastrado (login).
 * - Se o telefone não existe, cria um novo usuário (telefone + CPF obrigatórios).
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { phone, cpf, name, source } = req.body;

    if (!phone || !cpf) {
      throw new ApiError(400, 'Telefone e CPF são obrigatórios.');
    }
    if (!isValidPhone(phone)) {
      throw new ApiError(400, 'Telefone inválido.');
    }
    if (!isValidCPF(cpf)) {
      throw new ApiError(400, 'CPF inválido.');
    }

    const normalizedPhone = normalizePhone(phone);
    const normalizedCpf = normalizeCpf(cpf);

    const existingUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

    if (existingUser) {
      if (existingUser.cpf !== normalizedCpf) {
        throw new ApiError(401, 'CPF não confere com o telefone informado.');
      }
      return res.json({ user: existingUser, isNewUser: false });
    }

    const newUser = await prisma.user.create({
      data: {
        phone: normalizedPhone,
        cpf: normalizedCpf,
        name: name || null,
        source: source || null,
      },
    });

    return res.status(201).json({ user: newUser, isNewUser: true });
  })
);

module.exports = router;
