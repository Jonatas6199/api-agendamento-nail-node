import express from "express";
import { prisma } from "./db.js";
import { limparTelefone } from "./utils.js";
import { criarEvento } from "./googleCalendar.js";

const router = express.Router();

/**
 * @swagger
 * /v1/horarios:
 *   get:
 *     summary: Lista horários disponíveis
 *     parameters:
 *       - in: query
 *         name: data
 *         required: true
 *         schema:
 *           type: string
 *           example: 2026-07-25
 *     responses:
 *       200:
 *         description: Lista de horários
 */
router.get("/horarios", async (req, res) => {
  const { data } = req.query;

  if (!data) {
    return res.status(400).json({ mensagem: "Data inválida" });
  }

  const date = new Date(data);

  const gradeHorarios = [
    "09:00", "10:30", "13:00",
    "14:30", "16:00", "17:30"
  ];

  const agendados = await prisma.agendamento.findMany({
    where: {
      data: {
        gte: new Date(date.setHours(0,0,0)),
        lte: new Date(date.setHours(23,59,59))
      },
      status: { not: "Cancelado" }
    },
    select: { horario: true }
  });

  const ocupados = agendados.map(a => a.horario);

  const resultado = gradeHorarios.map(hora => ({
    hora,
    disponivel: !ocupados.includes(hora)
  }));

  res.json(resultado);
});

/**
 * @swagger
 * /v1/agendamentos:
 *   post:
 *     summary: Cria um agendamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               servico:
 *                 type: string
 *               nome:
 *                 type: string
 *               telefone:
 *                 type: string
 *               data:
 *                 type: string
 *                 example: 2026-07-25
 *               horario:
 *                 type: string
 *                 example: 14:30
 *     responses:
 *       201:
 *         description: Criado com sucesso
 *       409:
 *         description: Horário ocupado
 */
router.post("/agendamentos", async (req, res) => {
  const { servico, nome, telefone, data, horario } = req.body;

  if (!data) {
    return res.status(400).json({ mensagem: "Data inválida" });
  }

  const telLimpo = limparTelefone(telefone);

  try {
    const jaExiste = await prisma.agendamento.findFirst({
      where: {
        data: new Date(data),
        horario,
        status: { not: "Cancelado" }
      }
    });

    if (jaExiste) {
      return res.status(409).json({
        mensagem: "Horário já preenchido"
      });
    }

    const novo = await prisma.agendamento.create({
      data: {
        servico,
        nome,
        telefone: telLimpo,
        data: new Date(data),
        horario,
        status: "Confirmado"
      }
    });

    // async (não bloqueia)
    criarEvento({
      servico,
      nome,
      telefone: telLimpo,
      data,
      horario
    });

    res.status(201).json(novo);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro interno" });
  }
});

/**
 * @swagger
 * /v1/agendamentos:
 *   get:
 *     summary: Lista agendamentos por telefone
 *     parameters:
 *       - in: query
 *         name: telefone
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de agendamentos
 */
router.get("/agendamentos", async (req, res) => {
  const { telefone } = req.query;

  const tel = limparTelefone(telefone || "");

  if (!tel) {
    return res.status(400).json({ mensagem: "Telefone inválido" });
  }

  const lista = await prisma.agendamento.findMany({
    where: { telefone: tel },
    orderBy: [
      { data: "desc" },
      { horario: "asc" }
    ]
  });

  const response = lista.map(a => ({
    id: a.id,
    servico: a.servico,
    data: a.data.toISOString().split("T")[0],
    horario: a.horario,
    status: a.status
  }));

  res.json(response);
});

export default router;