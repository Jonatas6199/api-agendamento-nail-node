const express = require('express');
const dashboardRoutes = require('./dashboard.routes');
const appointmentsRoutes = require('./appointments.routes');
const clientsRoutes = require('./clients.routes');
const settingsRoutes = require('./settings.routes');

const router = express.Router();

router.use('/dashboard', dashboardRoutes);
router.use('/appointments', appointmentsRoutes);
router.use('/clients', clientsRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
