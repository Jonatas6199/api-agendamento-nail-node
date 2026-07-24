const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const availabilityService = require('../services/availabilityService');

const router = express.Router();

// GET /api/availability?procedureId=xxx&date=YYYY-MM-DD
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { procedureId, date } = req.query;

    if (!procedureId) {
      throw new ApiError(400, 'Parâmetro "procedureId" é obrigatório.');
    }

    const slots = await availabilityService.getAvailableSlots(procedureId, date);
    res.json({ date, procedureId, slots });
  })
);

module.exports = router;
