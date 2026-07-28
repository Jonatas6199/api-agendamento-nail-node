const { google } = require('googleapis');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TIMEZONE = process.env.CALENDAR_TIMEZONE || 'America/Sao_Paulo';
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;


// Caminho do JSON baixado no Google Cloud (conta de serviço)
const KEY_FILE_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
  path.join(__dirname, '../../google-service-account.json');



let cachedAuthClient = null;

async function getAuthClient() {
  if (cachedAuthClient) return cachedAuthClient;

  let auth;

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

  if (serviceAccountJson) {
   
    const credentials = JSON.parse(serviceAccountJson);

    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });

  } else {
    auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE_PATH,
      scopes: SCOPES,
    });
  }

  cachedAuthClient = await auth.getClient();
  return cachedAuthClient;
}

async function getCalendarClient() {
  const authClient = await getAuthClient();
  return google.calendar({ version: 'v3', auth: authClient });
}

/**
 * Cria um evento no Google Agenda da profissional.
 * IMPORTANTE: a conta de serviço precisa ter sido convidada como "colaboradora"
 * (com permissão de editar eventos) na agenda de destino, ou usar um calendário
 * de recurso próprio para o qual a conta de serviço tenha acesso direto.
 */
async function createEvent({ summary, description, startTime, endTime, attendeeEmail }) {
  if (!CALENDAR_ID) {
    throw new Error('GOOGLE_CALENDAR_ID não configurado no ambiente.');
  }

  const calendar = await getCalendarClient();

  const event = {
    summary,
    description,
    start: { dateTime: startTime, timeZone: TIMEZONE },
    end: { dateTime: endTime, timeZone: TIMEZONE },
  };

  /*
  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }
   */

  const response = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
    sendUpdates: attendeeEmail ? 'all' : 'none',
  });

  return response.data; // contém .id (googleEventId) e .htmlLink
}

async function updateEvent(eventId, { summary, description, startTime, endTime, attendeeEmail }) {
  if (!eventId) return null;

  const calendar = await getCalendarClient();

  const event = {
    summary,
    description,
    start: { dateTime: startTime, timeZone: TIMEZONE },
    end: { dateTime: endTime, timeZone: TIMEZONE },
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  const response = await calendar.events.update({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: event,
    sendUpdates: attendeeEmail ? 'all' : 'none',
  });

  return response.data;
}

async function cancelEvent(eventId) {
  if (!eventId) return;

  const calendar = await getCalendarClient();

  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
      sendUpdates: 'all',
    });
  } catch (err) {
    // 404/410 significa que o evento já não existe mais - não é um erro fatal aqui
    if (err.code !== 404 && err.code !== 410) {
      throw err;
    }
  }
}

module.exports = { createEvent, updateEvent, cancelEvent };
