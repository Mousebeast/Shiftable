'use strict';
process.env.VAPID_PUBLIC_KEY = 'BTest_public_key_base64url';
process.env.VAPID_PRIVATE_KEY = 'test_private_key_base64url';
process.env.VAPID_SUBJECT = 'mailto:test@test.com';

jest.mock('web-push');
jest.mock('../db/push', () => ({
  getSubscriptionsForUser: jest.fn(),
  deleteSubscription: jest.fn(),
}));

const webpush = require('web-push');
const { getSubscriptionsForUser, deleteSubscription } = require('../db/push');

// Require after mocks are in place
let push;
beforeAll(() => {
  push = require('./push');
});

beforeEach(() => {
  jest.clearAllMocks();
});

const SUB = { endpoint: 'https://fcm.example.com/sub1', p256dh: 'key1', auth: 'auth1' };

describe('sendToUser', () => {
  it('calls webpush.sendNotification for each subscription', async () => {
    getSubscriptionsForUser.mockReturnValue([SUB]);
    webpush.sendNotification.mockResolvedValue({});

    push.sendToUser(1, { title: 'Hello', body: 'World' });
    await new Promise(resolve => setImmediate(resolve));

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: SUB.endpoint, keys: { p256dh: SUB.p256dh, auth: SUB.auth } },
      JSON.stringify({ title: 'Hello', body: 'World' })
    );
  });

  it('sends to all subscriptions when user has multiple devices', async () => {
    const sub2 = { endpoint: 'https://fcm.example.com/sub2', p256dh: 'key2', auth: 'auth2' };
    getSubscriptionsForUser.mockReturnValue([SUB, sub2]);
    webpush.sendNotification.mockResolvedValue({});

    push.sendToUser(1, { title: 'Hello', body: 'World' });
    await new Promise(resolve => setImmediate(resolve));

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('prunes dead subscription on 410 response', async () => {
    getSubscriptionsForUser.mockReturnValue([SUB]);
    const err = new Error('Gone');
    err.statusCode = 410;
    webpush.sendNotification.mockRejectedValue(err);

    push.sendToUser(1, { title: 'Hi', body: 'test' });
    await new Promise(resolve => setImmediate(resolve));

    expect(deleteSubscription).toHaveBeenCalledWith(SUB.endpoint);
  });

  it('prunes dead subscription on 404 response', async () => {
    getSubscriptionsForUser.mockReturnValue([SUB]);
    const err = new Error('Not Found');
    err.statusCode = 404;
    webpush.sendNotification.mockRejectedValue(err);

    push.sendToUser(1, { title: 'Hi', body: 'test' });
    await new Promise(resolve => setImmediate(resolve));

    expect(deleteSubscription).toHaveBeenCalledWith(SUB.endpoint);
  });

  it('swallows other errors without pruning', async () => {
    getSubscriptionsForUser.mockReturnValue([SUB]);
    const err = new Error('Server Error');
    err.statusCode = 500;
    webpush.sendNotification.mockRejectedValue(err);

    push.sendToUser(1, { title: 'Hi', body: 'test' });
    await new Promise(resolve => setImmediate(resolve));

    expect(deleteSubscription).not.toHaveBeenCalled();
  });

  it('does nothing when user has no subscriptions', async () => {
    getSubscriptionsForUser.mockReturnValue([]);

    push.sendToUser(1, { title: 'Hi', body: 'test' });
    await new Promise(resolve => setImmediate(resolve));

    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe('sendToUsers', () => {
  it('calls sendToUser for each userId', async () => {
    getSubscriptionsForUser.mockReturnValue([SUB]);
    webpush.sendNotification.mockResolvedValue({});

    push.sendToUsers([1, 2, 3], { title: 'Hi', body: 'All' });
    await new Promise(resolve => setImmediate(resolve));

    expect(getSubscriptionsForUser).toHaveBeenCalledTimes(3);
  });

  it('does nothing for empty userId array', async () => {
    push.sendToUsers([], { title: 'Hi', body: 'test' });
    await new Promise(resolve => setImmediate(resolve));
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
