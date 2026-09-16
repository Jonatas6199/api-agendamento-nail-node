const prisma = require('../config/prisma');
const { ApiError } = require('../middleware/errorHandler');
const availabilityService = require('./availabilityService');
const googleCalendarService = require('./googleCalendarService');

function parseMoney(value, fieldName) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ApiError(400, `${fieldName} deve ser um valor válido.`);
  }
  return parsed;
}

function resolvePriceAdjustment(data, appointment = {}) {
  const hasExplicitType = data.priceAdjustmentType !== undefined;
  const basePrice = Number(
    data.basePrice ?? appointment.basePrice ?? appointment.totalPrice ?? appointment.procedure?.price ?? 0
  );
  let type = hasExplicitType
    ? String(data.priceAdjustmentType || '').toUpperCase() || null
    : appointment.priceAdjustmentType || null;
  let amount = data.priceAdjustmentAmount !== undefined
    ? parseMoney(data.priceAdjustmentAmount, 'Valor do ajuste')
    : hasExplicitType && !type ? 0 : Number(appointment.priceAdjustmentAmount || 0);

  if (!amount) type = null;
  if (amount > 0 && !['DISCOUNT', 'ADDITIONAL'].includes(type)) {
    throw new ApiError(400, 'Selecione DESCONTO ou ADICIONAL para o ajuste de valor.');
  }
  if (type === 'DISCOUNT' && amount > basePrice) {
    throw new ApiError(400, 'O desconto não pode ser maior que o valor-base do atendimento.');
  }

  const totalPrice = type === 'DISCOUNT'
    ? basePrice - amount
    : type === 'ADDITIONAL' ? basePrice + amount : basePrice;

  return {
    basePrice,
    priceAdjustmentType: type,
    priceAdjustmentAmount: amount,
    priceAdjustmentReason: type ? (data.priceAdjustmentReason !== undefined
      ? String(data.priceAdjustmentReason || '').trim() || null
      : appointment.priceAdjustmentReason || null) : null,
    totalPrice,
  };
}

async function syncAppointmentIncome(tx, appointment) {
  const amount = Number(appointment.amountPaid || 0);
  if (amount <= 0) {
    await tx.financialTransaction.deleteMany({ where: { appointmentId: appointment.id } });
    return;
  }

  await tx.financialTransaction.upsert({
    where: { appointmentId: appointment.id },
    create: {
      type: 'INCOME',
      category: 'Atendimentos',
      description: `${appointment.procedure.name} · ${appointment.user.name || appointment.user.phone}`,
      amount,
      occurredAt: new Date(),
      appointmentId: appointment.id,
    },
    update: {
      amount,
      description: `${appointment.procedure.name} · ${appointment.user.name || appointment.user.phone}`,
    },
  });
}

async function syncCalendarCreate(appointment) {
  try {
    const googleEvent = await googleCalendarService.createEvent({
      summary: `${appointment.procedure.name} - ${appointment.user.name || appointment.user.phone}`,
      description: [
        `Cliente: ${appointment.user.name || 'Não informado'}`,
        `Telefone: ${appointment.user.phone}`,
        appointment.notes ? `Observações: ${appointment.notes}` : null,
      ].filter(Boolean).join('\n'),
      startTime: appointment.startTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
      attendeeEmail: appointment.clientEmail || null,
    });

    return prisma.appointment.update({
      where: { id: appointment.id },
      data: { googleEventId: googleEvent.id },
      include: { user: true, procedure: true, anamnesis: true },
    });
  } catch (error) {
    console.error('Falha ao criar evento administrativo no Google Calendar:', error.message);
    return appointment;
  }
}

async function createAdminAppointment(data) {
  const { userId, procedureId, startTime } = data;
  if (!userId || !procedureId || !startTime) {
    throw new ApiError(400, 'Cliente, procedimento e horário são obrigatórios.');
  }

  const [user, procedure] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.procedure.findUnique({ where: { id: procedureId } }),
  ]);

  if (!user) throw new ApiError(404, 'Cliente não encontrado.');
  if (!procedure || !procedure.active) throw new ApiError(404, 'Procedimento não encontrado ou inativo.');

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime()) || start < new Date()) {
    throw new ApiError(400, 'Data ou horário inválido.');
  }

  const end = new Date(start.getTime() + procedure.durationMin * 60000);
  if (!await availabilityService.isSlotAvailable(start, end)) {
    throw new ApiError(409, 'Este horário não está mais disponível.');
  }

  const price = resolvePriceAdjustment(data, { totalPrice: procedure.price, procedure });
  const amountPaid = parseMoney(data.amountPaid, 'Valor pago');
  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        userId,
        procedureId,
        startTime: start,
        endTime: end,
        clientEmail: data.clientEmail || null,
        ...price,
        amountPaid,
        remainingPaymentMethod: data.remainingPaymentMethod || null,
        notes: data.notes || null,
        confirmedAt: data.confirmed ? new Date() : null,
      },
      include: { user: true, procedure: true, anamnesis: true },
    });
    await syncAppointmentIncome(tx, created);
    return created;
  });

  return syncCalendarCreate(appointment);
}

async function getActiveAppointment(id) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { user: true, procedure: true, anamnesis: true },
  });
  if (!appointment) throw new ApiError(404, 'Agendamento não encontrado.');
  return appointment;
}

async function rescheduleAdminAppointment(id, startTime) {
  const appointment = await getActiveAppointment(id);
  if (appointment.status !== 'SCHEDULED') {
    throw new ApiError(400, 'Somente agendamentos ativos podem ser reagendados.');
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime()) || start < new Date()) {
    throw new ApiError(400, 'Data ou horário inválido.');
  }
  const end = new Date(start.getTime() + appointment.procedure.durationMin * 60000);

  if (!await availabilityService.isSlotAvailable(start, end, appointment.id)) {
    throw new ApiError(409, 'Este horário não está mais disponível.');
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: { startTime: start, endTime: end },
    include: { user: true, procedure: true, anamnesis: true },
  });

  if (updated.googleEventId) {
    try {
      await googleCalendarService.updateEvent(updated.googleEventId, {
        summary: `${updated.procedure.name} - ${updated.user.name || updated.user.phone}`,
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        attendeeEmail: updated.clientEmail,
      });
    } catch (error) {
      console.error('Falha ao reagendar no Google Calendar:', error.message);
    }
  }

  return updated;
}

async function updateAdminAppointment(id, data) {
  const appointment = await getActiveAppointment(id);
  const update = {};

  if (data.notes !== undefined) update.notes = data.notes || null;
  if (data.clientEmail !== undefined) update.clientEmail = data.clientEmail || null;
  if (data.remainingPaymentMethod !== undefined) {
    update.remainingPaymentMethod = data.remainingPaymentMethod || null;
  }
  if (
    data.priceAdjustmentType !== undefined
    || data.priceAdjustmentAmount !== undefined
    || data.priceAdjustmentReason !== undefined
  ) {
    Object.assign(update, resolvePriceAdjustment(data, appointment));
  }
  if (data.amountPaid !== undefined) {
    update.amountPaid = parseMoney(data.amountPaid, 'Valor pago');
  }

  if (!Object.keys(update).length) return appointment;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: update,
      include: { user: true, procedure: true, anamnesis: true },
    });
    if (data.amountPaid !== undefined) await syncAppointmentIncome(tx, updated);
    return updated;
  });
}

async function confirmAdminAppointment(id, data = {}) {
  const appointment = await getActiveAppointment(id);
  if (appointment.status !== 'SCHEDULED') {
    throw new ApiError(400, 'Somente agendamentos ativos podem ser confirmados.');
  }

  const update = { confirmedAt: appointment.confirmedAt || new Date() };
  if (data.amountPaid !== undefined) {
    update.amountPaid = parseMoney(data.amountPaid, 'Valor pago');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: update,
      include: { user: true, procedure: true, anamnesis: true },
    });
    if (data.amountPaid !== undefined) await syncAppointmentIncome(tx, updated);
    return updated;
  });
}

async function completeAdminAppointment(id) {
  const appointment = await getActiveAppointment(id);
  if (appointment.status !== 'SCHEDULED') {
    throw new ApiError(400, 'Somente agendamentos ativos podem ser concluídos.');
  }

  if (!appointment.confirmedAt) {
    throw new ApiError(400, 'Confirme o agendamento antes de finalizar o atendimento.');
  }

  const changed = await prisma.appointment.updateMany({
    where: { id, status: 'SCHEDULED', confirmedAt: { not: null } },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  if (!changed.count) throw new ApiError(409, 'O agendamento foi alterado. Atualize a página.');
  return getActiveAppointment(id);
}

async function cancelAdminAppointment(id) {
  const appointment = await getActiveAppointment(id);
  if (appointment.status !== 'SCHEDULED') throw new ApiError(400, 'Somente agendamentos ativos podem ser cancelados.');

  const changed = await prisma.appointment.updateMany({
    where: { id, status: 'SCHEDULED' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  if (!changed.count) throw new ApiError(409, 'O agendamento foi alterado. Atualize a página.');
  const updated = await getActiveAppointment(id);

  if (appointment.googleEventId) {
    try {
      await googleCalendarService.cancelEvent(appointment.googleEventId);
    } catch (error) {
      console.error('Falha ao cancelar no Google Calendar:', error.message);
    }
  }

  return updated;
}

module.exports = {
  createAdminAppointment,
  rescheduleAdminAppointment,
  updateAdminAppointment,
  confirmAdminAppointment,
  completeAdminAppointment,
  cancelAdminAppointment,
};
