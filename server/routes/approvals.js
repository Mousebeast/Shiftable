'use strict';

const express = require('express');
const { requireManager } = require('../middleware/auth');
const { getPendingTimeOff } = require('../db/timeoff');
const { getPendingAvailability } = require('../db/availability');
const { getPendingSwaps } = require('../db/swaps');

const router = express.Router();

router.get('/pending', requireManager, (req, res) => {
  return res.json({
    timeoff: getPendingTimeOff(),
    availability: getPendingAvailability(),
    swaps: getPendingSwaps(),
  });
});

module.exports = router;
