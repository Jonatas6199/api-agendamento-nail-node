const prisma = require('../config/prisma');
const { ApiError } = require('../middleware/errorHandler');

// Granularidade dos horários candidatos exibidos ao cliente (em minutos)
const SLOT_STEP_MINUTES = 15;

function timeStringToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function parseDateOnly(dateStr) {
  // Espera "YYYY-MM-DD". Cria a data à meia-noite no fuso do servidor.
  const date = new Date(`${dateStr}T00:00:00`);
  return date;
}

/**
 * Retorna os horários de início disponíveis para um procedimento em uma data específica,
 * considerando: horário de funcionamento do dia da semana, datas bloqueadas,
 * agendamentos já existentes e a duração do procedimento escolhido.
 */
async function getAvailableSlots(procedureId, dateStr) {
  if (!dateStr) {
    throw new ApiError(400, 'Parâmetro "date" (YYYY-MM-DD) é obrigatório.');
  }

  const procedure = await prisma.procedure.findUnique({ where: { id: procedureId } });
  if (!procedure || !procedure.active) {
    throw new ApiError(404, 'Procedimento não encontrado ou inativo.');
  }

  const date = parseDateOnly(dateStr);
  if (isNaN(date.getTime())) {
    throw new ApiError(400, 'Data inválida. Use o formato YYYY-MM-DD.');
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date < startOfToday) {
    return []; // não permite consultar/agendar datas passadas
  }

  const blocked = await prisma.blockedDate.findUnique({ where: { date } });
  if (blocked) return [];

  const weekday = date.getDay(); // 0-6
  const workingHours = await prisma.workingHours.findUnique({ where: { weekday } });
  if (!workingHours || !workingHours.active) {
    return []; // dia sem expediente (ex: domingo/segunda)
  }
  const lunchStartMinutes = workingHours.lunchStartTime
  ? timeStringToMinutes(workingHours.lunchStartTime)
  : null;

  const lunchEndMinutes = workingHours.lunchEndTime
  ? timeStringToMinutes(workingHours.lunchEndTime)
  : null;

  const dayStartMinutes = timeStringToMinutes(workingHours.startTime);
  const dayEndMinutes = timeStringToMinutes(workingHours.endTime);
  const durationMin = procedure.durationMin;

  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Busca agendamentos ativos do dia inteiro (independente do procedimento,
  // pois só existe uma profissional realizando todos os atendimentos)
  const existingAppointments = await prisma.appointment.findMany({
    where: {
      status: 'SCHEDULED',
      startTime: { gte: dayStart, lt: dayEnd },
    },
    select: { startTime: true, endTime: true },
  });

  const slots = [];
  for (
    let minutes = dayStartMinutes;
    minutes + durationMin <= dayEndMinutes;
    minutes += SLOT_STEP_MINUTES
  ) {
    const slotStart = new Date(date);
    slotStart.setMinutes(minutes);
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);

    if (slotStart < now) continue; // não permite horário já passado no dia atual

    const slotStartMinutes = minutes;
    const slotEndMinutes = minutes + durationMin;

    // Verifica conflito com horário de almoço
    const hasLunchConflict =
      lunchStartMinutes !== null &&
      lunchEndMinutes !== null &&
      slotStartMinutes < lunchEndMinutes &&
      slotEndMinutes > lunchStartMinutes;

    if (hasLunchConflict) continue;

    const hasConflict = existingAppointments.some(
      (appt) => slotStart < appt.endTime && slotEnd > appt.startTime
    );

    if (!hasConflict) {
      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
      });
    }
  }

  return slots;
}

/**
 * Confere no momento da confirmação se o horário pedido ainda está livre
 * (proteção contra condição de corrida entre duas pessoas agendando ao mesmo tempo).
 * excludeAppointmentId é usado em casos de reagendamento, para ignorar o próprio registro.
 */
async function isSlotAvailable(startTime, endTime, excludeAppointmentId = null) {
  const where = {
    status: 'SCHEDULED',
    startTime: { lt: endTime },
    endTime: { gt: startTime },
  };

  if (excludeAppointmentId) {
    where.id = { not: excludeAppointmentId };
  }

  const conflicts = await prisma.appointment.findMany({ where });
  return conflicts.length === 0;
}

module.exports = { getAvailableSlots, isSlotAvailable };
