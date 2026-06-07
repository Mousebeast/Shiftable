'use strict';
process.env.JWT_SECRET = 'test-secret';

const { createTestDb, seedUser } = require('../test/helpers');
const {
  getNotificationsForUser,
  getUnreadCount,
  markAllRead,
  createNotification,
} = require('../db/notifications');

describe('notifications DB helpers', () => {
  let db, user;
  beforeEach(() => {
    db = createTestDb();
    user = seedUser(db);
  });

  it('returns empty array when no notifications', () => {
    expect(getNotificationsForUser(user.id, db)).toEqual([]);
  });

  it('createNotification inserts and getNotificationsForUser retrieves', () => {
    createNotification({ userId: user.id, type: 'broadcast', title: 'Hi', body: 'Test' }, db);
    const notifs = getNotificationsForUser(user.id, db);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toBe('Hi');
    expect(notifs[0].read_at).toBeNull();
  });

  it('getUnreadCount returns correct count', () => {
    createNotification({ userId: user.id, type: 'broadcast', title: 'A', body: 'B' }, db);
    createNotification({ userId: user.id, type: 'broadcast', title: 'C', body: 'D' }, db);
    expect(getUnreadCount(user.id, db)).toBe(2);
  });

  it('markAllRead sets read_at on all unread', () => {
    createNotification({ userId: user.id, type: 'broadcast', title: 'A', body: 'B' }, db);
    markAllRead(user.id, db);
    expect(getUnreadCount(user.id, db)).toBe(0);
  });

  it('createNotification with data stores JSON', () => {
    createNotification({ userId: user.id, type: 'swap_offered', title: 'Swap', body: 'Check it', data: { swapId: 5 } }, db);
    const notifs = getNotificationsForUser(user.id, db);
    expect(notifs[0].data).toBe('{"swapId":5}');
  });
});
