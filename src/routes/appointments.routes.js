const express = require('express');
const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { isValidEmail } = require('../utils/validators');
const availabilityService = require('../services/availabilityService');
const googleCalendarService = require('../services/googleCalendarService');
const { hasRecentAnamnesis, hasPreviousAppointments } = require('../services/anamnesisService');

const router = express.Router();

/**
 * POST /api/appointments
 * Body: {
 *   userId, procedureId, startTime (ISO),
 *   clientEmail?,
 *   anamnesis: {
 *     isFirstVisit, usesGelPolish, hasCosmeticAllergy,
 *     cosmeticAllergyDetails?, hasFrequentLifting,
 *     usesContinuousMedication, continuousMedicationDetails?
 *   }
 * }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, procedureId, startTime, clientEmail, anamnesis } = req.body;

    if (!userId || !procedureId || !startTime) {
      throw new ApiError(400, 'userId, procedureId e startTime são obrigatórios.');
    }

    if (clientEmail && !isValidEmail(clientEmail)) {
      throw new ApiError(400, 'E-mail informado é inválido.');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, 'Usuário não encontrado.');

    // --- VERIFICAÇÃO DA ANAMNESE ---
    const [userHasRecentAnamnesis, userHasPreviousAppointments] = await Promise.all([
      hasRecentAnamnesis(userId),
      hasPreviousAppointments(userId),
    ]);

    // Se NÃO tem anamnese nos últimos 3 meses E NÃO enviou os dados de anamnese na requisição
    if (!userHasRecentAnamnesis && !anamnesis) {
      throw new ApiError(
        400,
        'A ficha de anamnese é obrigatória, pois não identificamos um preenchimento nos últimos 3 meses.'
      );
    }

    let cosmeticAllergyDetails = null;
    let continuousMedicationDetails = null;

    if (anamnesis) {
      const requiredBooleanFields = [
        'isFirstVisit',
        'usesGelPolish',
        'hasCosmeticAllergy',
        'hasFrequentLifting',
        'usesContinuousMedication',
      ];

      const missingAnswer = requiredBooleanFields.some(
        (field) => typeof anamnesis[field] !== 'boolean'
      );

      if (missingAnswer) {
        throw new ApiError(400, 'Responda todas as perguntas da ficha de anamnese com Sim ou Não.');
      }

      cosmeticAllergyDetails = typeof anamnesis.cosmeticAllergyDetails === 'string'
        ? anamnesis.cosmeticAllergyDetails.trim()
        : '';
      continuousMedicationDetails = typeof anamnesis.continuousMedicationDetails === 'string'
        ? anamnesis.continuousMedicationDetails.trim()
        : '';

      if (anamnesis.hasCosmeticAllergy && !cosmeticAllergyDetails) {
        throw new ApiError(400, 'Informe qual ou quais alergias a cosméticos você possui.');
      }

      if (anamnesis.usesContinuousMedication && !continuousMedicationDetails) {
        throw new ApiError(400, 'Informe qual ou quais medicamentos de uso contínuo você utiliza.');
      }
    }

    const procedure = await prisma.procedure.findUnique({ where: { id: procedureId } });
    if (!procedure || !procedure.active) {
      throw new ApiError(404, 'Procedimento não encontrado ou inativo.');
    }

    const start = new Date(startTime);
    if (isNaN(start.getTime())) throw new ApiError(400, 'startTime inválido.');
    if (start < new Date()) throw new ApiError(400, 'Não é possível agendar em uma data/horário passado.');

    const end = new Date(start.getTime() + procedure.durationMin * 60000);

    // Revalida disponibilidade no momento da confirmação (evita corrida entre dois clientes)
    const available = await availabilityService.isSlotAvailable(start, end);
    if (!available) {
      throw new ApiError(409, 'Este horário acabou de ser reservado. Escolha outro horário.');
    }

    // Cria o agendamento + ficha de anamnese (somente se fornecida) em uma única transação
    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          userId,
          procedureId,
          startTime: start,
          endTime: end,
          clientEmail: clientEmail || null,
          basePrice: procedure.price,
          totalPrice: procedure.price,
          // Cria o registro na tabela de Anamnese apenas se a propriedade 'anamnesis' existir no body
          ...(anamnesis && {
            anamnesis: {
              create: {
                // O histórico de appointments prevalece sobre a resposta enviada pelo cliente.
                isFirstVisit: !userHasPreviousAppointments && anamnesis.isFirstVisit,
                usesGelPolish: anamnesis.usesGelPolish,
                hasCosmeticAllergy: anamnesis.hasCosmeticAllergy,
                cosmeticAllergyDetails: anamnesis.hasCosmeticAllergy
                  ? cosmeticAllergyDetails
                  : null,
                hasFrequentLifting: anamnesis.hasFrequentLifting,
                usesContinuousMedication: anamnesis.usesContinuousMedication,
                continuousMedicationDetails: anamnesis.usesContinuousMedication
                  ? continuousMedicationDetails
                  : null,
              },
            },
          }),
        },
        include: { anamnesis: true, procedure: true, user: true },
      });
      return created;
    });

    // Cria o evento no Google Agenda da profissional
    let googleEvent = null;
    try {
      googleEvent = await googleCalendarService.createEvent({
        summary: `${procedure.name} - ${user.name || user.phone}`,
        description: [
          `Cliente: ${user.name || 'Não informado'}`,
          `Telefone: ${user.phone}`,
          `Procedimento: ${procedure.name}`,
          cosmeticAllergyDetails
            ? `Alergias a cosméticos: ${cosmeticAllergyDetails}`
            : null,
          continuousMedicationDetails
            ? `Medicamentos de uso contínuo: ${continuousMedicationDetails}`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        attendeeEmail: clientEmail || null,
      });

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { googleEventId: googleEvent.id },
      });
    } catch (err) {
      console.error('Falha ao criar evento no Google Calendar:', err.message);
      return res.status(201).json({
        appointment,
        warning:
          'Agendamento confirmado, porém houve falha ao sincronizar com o Google Agenda. A equipe será notificada.',
      });
    }

    res.status(201).json({ appointment: { ...appointment, googleEventId: googleEvent.id } });
  })
);

// GET /api/appointments?userId=xxx&status=SCHEDULED
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, status } = req.query;
    if (!userId) throw new ApiError(400, 'Parâmetro "userId" é obrigatório.');

    const where = { userId };
    if (status) where.status = status;

    const appointments = await prisma.appointment.findMany({
      where,
      include: { procedure: true, anamnesis: true },
      orderBy: { startTime: 'desc' },
    });

    res.json(appointments);
  })
);

// GET /api/appointments/:id - detalhe de um agendamento
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { procedure: true, anamnesis: true, user: true },
    });
    if (!appointment) throw new ApiError(404, 'Agendamento não encontrado.');
    res.json(appointment);
  })
);

/**
 * PATCH /api/appointments/:id/reschedule
 * Body: { startTime (ISO) }
 * Altera o dia/horário do agendamento, revalidando disponibilidade e atualizando o Google Agenda.
 */
router.patch(
  '/:id/reschedule',
  asyncHandler(async (req, res) => {
    const { startTime } = req.body;
    if (!startTime) throw new ApiError(400, 'startTime é obrigatório.');

    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { procedure: true, user: true },
    });
    if (!appointment) throw new ApiError(404, 'Agendamento não encontrado.');
    if (appointment.status !== 'SCHEDULED') {
      throw new ApiError(400, 'Somente agendamentos ativos podem ser reagendados.');
    }

    const newStart = new Date(startTime);
    if (isNaN(newStart.getTime())) throw new ApiError(400, 'startTime inválido.');
    if (newStart < new Date()) throw new ApiError(400, 'Não é possível reagendar para uma data/horário passado.');

    const newEnd = new Date(newStart.getTime() + appointment.procedure.durationMin * 60000);

    const available = await availabilityService.isSlotAvailable(newStart, newEnd, appointment.id);
    if (!available) {
      throw new ApiError(409, 'Este horário já está ocupado. Escolha outro.');
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { startTime: newStart, endTime: newEnd },
      include: { procedure: true, anamnesis: true },
    });

    if (appointment.googleEventId) {
      try {
        await googleCalendarService.updateEvent(appointment.googleEventId, {
          summary: `${appointment.procedure.name} - ${appointment.user.name || appointment.user.phone}`,
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          attendeeEmail: appointment.clientEmail,
        });
      } catch (err) {
        console.error('Falha ao atualizar evento no Google Calendar:', err.message);
      }
    }

    res.json(updated);
  })
);

// PATCH /api/appointments/:id/cancel - cancela o agendamento e remove o evento do Google Agenda
router.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appointment) throw new ApiError(404, 'Agendamento não encontrado.');
    if (appointment.status === 'CANCELLED') {
      throw new ApiError(400, 'Este agendamento já está cancelado.');
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (appointment.googleEventId) {
      try {
        await googleCalendarService.cancelEvent(appointment.googleEventId);
      } catch (err) {
        console.error('Falha ao cancelar evento no Google Calendar:', err.message);
      }
    }

    res.json(updated);
  })
);

module.exports = router;
