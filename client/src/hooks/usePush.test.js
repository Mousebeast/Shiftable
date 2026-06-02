import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePush } from './usePush';

const mockGetSubscription = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();

const mockSW = {
  pushManager: {
    getSubscription: mockGetSubscription,
    subscribe: mockSubscribe,
  },
};

beforeEach(() => {
  vi.clearAllMocks();

  Object.defineProperty(global, 'navigator', {
    value: {
      serviceWorker: {
        ready: Promise.resolve(mockSW),
        register: vi.fn(),
      },
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(global, 'Notification', {
    value: { permission: 'default' },
    writable: true,
    configurable: true,
  });

  global.fetch = vi.fn();
  mockGetSubscription.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePush — initial state', () => {
  it('detects push as supported when serviceWorker and PushManager exist', async () => {
    Object.defineProperty(global.navigator, 'serviceWorker', {
      value: { ready: Promise.resolve(mockSW) },
      writable: true,
      configurable: true,
    });
    global.PushManager = {};

    const { result } = renderHook(() => usePush());
    await waitFor(() => expect(result.current.isSubscribed).toBeDefined());
    expect(result.current.isSupported).toBe(true);
  });

  it('isSubscribed is true when an existing subscription is found', async () => {
    global.PushManager = {};
    mockGetSubscription.mockResolvedValue({ endpoint: 'https://fcm.example.com/test' });

    const { result } = renderHook(() => usePush());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
  });

  it('isSubscribed is false when no existing subscription', async () => {
    global.PushManager = {};
    mockGetSubscription.mockResolvedValue(null);

    const { result } = renderHook(() => usePush());
    await waitFor(() => expect(result.current.isSubscribed).toBe(false));
  });
});

describe('usePush — subscribe', () => {
  it('fetches VAPID key, subscribes, and posts subscription to server', async () => {
    global.PushManager = {};
    const mockSubObj = {
      endpoint: 'https://fcm.example.com/new',
      toJSON: () => ({
        endpoint: 'https://fcm.example.com/new',
        keys: { p256dh: 'key', auth: 'auth' },
      }),
    };
    mockSubscribe.mockResolvedValue(mockSubObj);
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ publicKey: 'BGtest123' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });

    const { result } = renderHook(() => usePush());
    let out;
    await act(async () => {
      out = await result.current.subscribe();
    });

    expect(out.ok).toBe(true);
    expect(result.current.isSubscribed).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/push/vapid-key', expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({ method: 'POST' }));
  });

  it('returns ok:false when not supported', async () => {
    delete global.PushManager;
    const { result } = renderHook(() => usePush());
    let out;
    await act(async () => {
      out = await result.current.subscribe();
    });
    expect(out.ok).toBe(false);
  });
});

describe('usePush — unsubscribe', () => {
  it('unsubscribes and deletes from server', async () => {
    global.PushManager = {};
    const mockSubObj = {
      endpoint: 'https://fcm.example.com/existing',
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    mockGetSubscription.mockResolvedValue(mockSubObj);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });

    const { result } = renderHook(() => usePush());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(mockSubObj.unsubscribe).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('/api/push/unsubscribe', expect.objectContaining({ method: 'DELETE' }));
    expect(result.current.isSubscribed).toBe(false);
  });
});
