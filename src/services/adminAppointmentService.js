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

  const totalPrice = Number(procedure.price);
  const amountPaid = parseMoney(data.amountPaid, 'Valor pago');
  if (amountPaid > totalPrice) {
    throw new ApiError(400, 'O valor pago não pode ser maior que o valor total.');
  }

  const appointment = await prisma.appointment.create({
    data: {
      userId,
      procedureId,
      startTime: start,
      endTime: end,
      clientEmail: data.clientEmail || null,
      totalPrice,
      amountPaid,
      remainingPaymentMethod: data.remainingPaymentMethod || null,
      notes: data.notes || null,
      confirmedAt: data.confirmed ? new Date() : null,
    },
    include: { user: true, procedure: true, anamnesis: true },
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
  if (data.amountPaid !== undefined) {
    const amountPaid = parseMoney(data.amountPaid, 'Valor pago');
    const totalPrice = Number(appointment.totalPrice ?? appointment.procedure.price);
    if (amountPaid > totalPrice) {
      throw new ApiError(400, 'O valor pago não pode ser maior que o valor total.');
    }
    update.amountPaid = amountPaid;
  }

  if (!Object.keys(update).length) return appointment;

  return prisma.appointment.update({
    where: { id },
    data: update,
    include: { user: true, procedure: true, anamnesis: true },
  });
}

async function confirmAdminAppointment(id, data = {}) {
  const appointment = await getActiveAppointment(id);
  if (appointment.status !== 'SCHEDULED') {
    throw new ApiError(400, 'Somente agendamentos ativos podem ser confirmados.');
  }

  const update = { confirmedAt: appointment.confirmedAt || new Date() };
  if (data.amountPaid !== undefined) {
    const amountPaid = parseMoney(data.amountPaid, 'Valor pago');
    const totalPrice = Number(appointment.totalPrice ?? appointment.procedure.price);
    if (amountPaid > totalPrice) throw new ApiError(400, 'O valor pago não pode exceder o valor total.');
    update.amountPaid = amountPaid;
  }

  return prisma.appointment.update({
    where: { id },
    data: update,
    include: { user: true, procedure: true, anamnesis: true },
  });
}

async function completeAdminAppointment(id) {
  const appointment = await getActiveAppointment(id);
  if (appointment.status !== 'SCHEDULED') {
    throw new ApiError(400, 'Somente agendamentos ativos podem ser concluídos.');
  }

  return prisma.appointment.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date() },
    include: { user: true, procedure: true, anamnesis: true },
  });
}

async function cancelAdminAppointment(id) {
  const appointment = await getActiveAppointment(id);
  if (appointment.status === 'CANCELLED') throw new ApiError(400, 'Agendamento já cancelado.');

  const updated = await prisma.appointment.update({
    where: { id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
    include: { user: true, procedure: true, anamnesis: true },
  });

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
