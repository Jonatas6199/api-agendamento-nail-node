const prisma = require('../config/prisma');

/**
 * Verifica se o usuário preencheu alguma ficha de anamnese nos últimos 3 meses.
 * @param {string} userId - ID do usuário
 * @returns {Promise<boolean>} true se tiver ficha nos últimos 3 meses, false caso contrário.
 */
async function hasRecentAnamnesis(userId) {
  // Calcula a data de corte (exatamente 3 meses atrás)
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // Busca a primeira anamnese vinculada a algum agendamento do usuário criada nos últimos 3 meses
  const recentAnamnesis = await prisma.anamnesis.findFirst({
    where: {
      appointment: {
        userId: userId,
      },
      createdAt: {
        gte: threeMonthsAgo, // Maior ou igual a 3 meses atrás
      },
    },
    select: {
      id: true,
    },
  });

  return !!recentAnamnesis; // Retorna true se encontrou, false se não encontrou
}

/**
 * Verifica se já existe qualquer agendamento para o usuário, independentemente
 * do status ou da data. Um agendamento cancelado também caracteriza histórico
 * no estúdio.
 * @param {string} userId - ID do usuário
 * @returns {Promise<boolean>} true se houver ao menos um agendamento.
 */
async function hasPreviousAppointments(userId) {
  const appointment = await prisma.appointment.findFirst({
    where: { userId },
    select: { id: true },
  });

  return !!appointment;
}

module.exports = {
  hasRecentAnamnesis,
  hasPreviousAppointments,
};
