require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const proceduresRoutes = require('./routes/procedures.routes');
const availabilityRoutes = require('./routes/availability.routes');
const appointmentsRoutes = require('./routes/appointments.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/procedures', proceduresRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/appointments', appointmentsRoutes);

// 404 para rotas não mapeadas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Middleware central de tratamento de erros - deve ser o último
app.use(errorHandler);

module.exports = app;
