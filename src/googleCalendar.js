import { google } from "googleapis";

const calendar = google.calendar("v3");

export async function criarEvento({
  servico,
  nome,
  telefone,
  data,
  horario
}) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: "google-credentials.json",
      scopes: ["https://www.googleapis.com/auth/calendar"]
    });

    const client = await auth.getClient();

    const [hora, minuto] = horario.split(":").map(Number);

    const inicio = new Date(data);
    inicio.setHours(hora, minuto, 0);

    const fim = new Date(inicio);
    fim.setHours(fim.getHours() + 1);

    const event = {
      summary: `${servico} - ${nome}`,
      description: `Cliente: ${nome}\nWhatsApp: ${telefone}`,
      start: {
        dateTime: inicio,
        timeZone: "America/Sao_Paulo"
      },
      end: {
        dateTime: fim,
        timeZone: "America/Sao_Paulo"
      }
    };

    const response = await calendar.events.insert({
      auth: client,
      calendarId: "primary",
      requestBody: event
    });

    return response.data.id;
  } catch (err) {
    console.error("Erro Google Calendar:", err.message);
    return null;
  }
}