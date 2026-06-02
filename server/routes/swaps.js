'use strict';
const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const {
  getOpenSwapsForUser, getMySwaps, getShiftForSwap, createSwapOffer,
  claimSwap, resolveSwap, resolveAndTransfer, cancelSwap, getSwapById,
} = require('../db/swaps');
const { checkAutoApprove } = require('../services/autoApprove');
const db = require('../db/db');
const { createNotification } = require('../db/notifications');
const { sendToUser, sendToUsers } = require('../services/push');
const { getActiveUserIds } = require('../db/users');

const router = express.Router();

// GET /api/swaps — open swaps user can claim + own offers
router.get('/', requireStaff, (req, res) => {
  const open = getOpenSwapsForUser(req.user.userId);
  const mine = getMySwaps(req.user.userId);
  return res.json({ open, mine });
});

// POST /api/swaps — offer a shift for swap
router.post('/', requireStaff, (req, res) => {
  const shiftId = Number(req.body.shiftId);
  if (!shiftId) return res.status(400).json({ error: 'shiftId required' });
  const shift = getShiftForSwap(shiftId);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (shift.user_id !== req.user.userId) return res.status(403).json({ error: 'Not your shift' });
  if (shift.schedule_status !== 'published') return res.status(400).json({ error: 'Schedule not published' });
  const row = createSwapOffer(req.user.userId, shiftId);
  const recipientIds = getActiveUserIds(shift.group_id).filter(id => id !== req.user.userId);
  if (recipientIds.length > 0) {
    const title = 'Shift Available to Swap';
    const body = `A ${shift.start_time} shift on ${shift.date} is available to claim.`;
    const data = { url: '/swaps' };
    for (const userId of recipientIds) {
      createNotification({ userId, type: 'swap_offered', title, body, data });
    }
    sendToUsers(recipientIds, { title, body, data }); // fire-and-forget
  }
  return res.status(201).json({ id: row.id });
});

// POST /api/swaps/:id/claim — claim an open swap
router.post('/:id/claim', requireStaff, (req, res) => {
  const swapId = Number(req.params.id);
  const swap = getSwapById(swapId);
  if (!swap || swap.status !== 'open') return res.status(404).json({ error: 'Swap not available' });
  if (swap.requester_id === req.user.userId) return res.status(400).json({ error: 'Cannot claim your own swap' });

  const result = claimSwap(swapId, req.user.userId);
  if (result.changes === 0) return res.status(409).json({ error: 'Swap already claimed' });

  const updatedSwap = { ...swap, claimer_id: req.user.userId };
  const autoApproved = checkAutoApprove(updatedSwap, db);
  const newStatus = autoApproved ? 'auto_approved' : 'pending_manager';
  if (autoApproved) {
    resolveAndTransfer(swapId, newStatus);
  } else {
    resolveSwap(swapId, newStatus);
  }

  const title = autoApproved ? 'Swap Auto-Approved' : 'Swap Pending Review';
  const body = autoApproved
    ? 'Your swap has been automatically approved.'
    : 'Your swap request needs manager approval.';
  const data = { url: '/swaps' };
  createNotification({ userId: swap.requester_id, type: 'swap_resolved', title, body, data });
  sendToUser(swap.requester_id, { title, body, data }); // fire-and-forget

  return res.json({ status: newStatus });
});

// DELETE /api/swaps/:id — cancel own open offer
router.delete('/:id', requireStaff, (req, res) => {
  cancelSwap(Number(req.params.id), req.user.userId);
  return res.json({ ok: true });
});

// PATCH /api/swaps/:id/approve — manager approves pending swap
router.patch('/:id/approve', requireManager, (req, res) => {
  const swapId = Number(req.params.id);
  const swap = getSwapById(swapId);
  if (!swap) return res.status(404).json({ error: 'Swap not found' });
  if (swap.status !== 'pending_manager') return res.status(409).json({ error: 'Swap is not pending manager approval' });
  resolveAndTransfer(swapId, 'manager_approved');
  const title = 'Swap Approved';
  const body = 'A manager has approved the shift swap.';
  const data = { url: '/swaps' };
  for (const userId of [swap.requester_id, swap.claimer_id].filter(Boolean)) {
    createNotification({ userId, type: 'swap_resolved', title, body, data });
    sendToUser(userId, { title, body, data }); // fire-and-forget
  }
  return res.json({ ok: true });
});

// PATCH /api/swaps/:id/deny — manager denies pending swap
router.patch('/:id/deny', requireManager, (req, res) => {
  const swapId = Number(req.params.id);
  const swap = getSwapById(swapId);
  if (!swap) return res.status(404).json({ error: 'Swap not found' });
  if (swap.status !== 'pending_manager') return res.status(409).json({ error: 'Swap is not pending manager approval' });
  resolveSwap(swapId, 'denied');
  const title = 'Swap Denied';
  const body = 'A manager has denied the shift swap.';
  const data = { url: '/swaps' };
  for (const userId of [swap.requester_id, swap.claimer_id].filter(Boolean)) {
    createNotification({ userId, type: 'swap_resolved', title, body, data });
    sendToUser(userId, { title, body, data }); // fire-and-forget
  }
  return res.json({ ok: true });
});

module.exports = router;
