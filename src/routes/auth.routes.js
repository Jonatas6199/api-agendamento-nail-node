const express = require('express');
const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { normalizePhone, normalizeAnoNascimento, isValidCPF, isValidPhone } = require('../utils/validators');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { phone, anoNascimento, name?, source? }
 *
 * Regra:
 * - Se o telefone já existe, o ano de nascimento enviado precisa bater com o cadastrado (login).
 * - Se o telefone não existe, cria um novo usuário (telefone + ano de nascimento obrigatórios).
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { phone, anoNascimento, name, source } = req.body;

    if (!phone || !anoNascimento) {
      throw new ApiError(400, 'Telefone e ano de nascimento são obrigatórios.');
    }
    if (!isValidPhone(phone)) {
      throw new ApiError(400, 'Telefone inválido.');
    }
    if (!isValidAnoNascimento(anoNascimento)) {
      throw new ApiError(400, 'Ano de nascimento inválido.');
    }

    const normalizedPhone = normalizePhone(phone);
    const normalizedAnoNascimento = normalizeAnoNascimento(anoNascimento);

    const existingUser = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

    if (existingUser) {
      if (existingUser.anoNascimento !== normalizedAnoNascimento) {
        throw new ApiError(401, 'Ano de nascimento não confere com o telefone informado.');
      }
      return res.json({ user: existingUser, isNewUser: false });
    }

    const newUser = await prisma.user.create({
      data: {
        phone: normalizedPhone,
        anoNascimento: normalizedAnoNascimento,
        name: name || null,
        source: source || null,
      },
    });

    return res.status(201).json({ user: newUser, isNewUser: true });
  })
);

module.exports = router;
