'use strict';

const { getApproverIds } = require('../db/users');
const { createNotification } = require('../db/notifications');
const { sendToUsers } = require('./push');

/**
 * Tell the people who can act on the Approvals queue that something is waiting.
 *
 * Every notification in the app used to flow outward to staff — approvals,
 * denials, publishes, broadcasts. Nothing flowed inward, so all three things
 * that land in the queue (time-off, availability, escalated swaps) were silent
 * on the manager side and the queue was pull-only.
 *
 * Push is fire-and-forget by the project rule: a dead subscription must never
 * fail the staff member's request that triggered this.
 *
 * @param {object}  args
 * @param {number}  args.excludeUserId  submitter, so a manager filing their own
 *                                      request is not notified about it
 * @param {string}  args.type           notification type (free text column)
 * @param {string}  args.title
 * @param {string}  args.body
 * @param {string} [args.url]           where tapping it should land
 */
function notifyApprovers({ excludeUserId, type, title, body, url = '/approvals' }) {
  const data = { url };
  const approverIds = getApproverIds(excludeUserId);
  if (approverIds.length === 0) return [];
  for (const userId of approverIds) {
    createNotification({ userId, type, title, body, data });
  }
  sendToUsers(approverIds, { title, body, data });
  return approverIds;
}

module.exports = { notifyApprovers };
