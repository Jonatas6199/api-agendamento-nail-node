require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const proceduresRoutes = require('./routes/procedures.routes');
const availabilityRoutes = require('./routes/availability.routes');
const appointmentsRoutes = require('./routes/appointments.routes');
const adminAuthRoutes = require('./routes/admin/auth.routes');
const adminRoutes = require('./routes/admin');
const { requireHttps, requireAdmin } = require('./middleware/adminAuth');

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida pelo CORS.'));
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-API-Key'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/procedures', proceduresRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/admin/auth', requireHttps, adminAuthRoutes);
app.use('/api/admin', requireHttps, requireAdmin, adminRoutes);

// 404 para rotas não mapeadas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Middleware central de tratamento de erros - deve ser o último
app.use(errorHandler);

module.exports = app;
