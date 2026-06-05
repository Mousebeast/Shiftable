import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdmin } from './useAdmin';

const mockSettings = { restaurant_name: 'Test Place', max_consecutive_days: '6' };
const mockUsers = [
  { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin', is_active: 1 },
  { id: 2, name: 'Staff User', email: 'staff@test.com', role: 'staff', is_active: 1 },
];

function mockFetch(responses) {
  let i = 0;
  global.fetch = vi.fn(() => {
    const r = responses[i] ?? responses[responses.length - 1];
    i++;
    return Promise.resolve({
      ok: r.ok !== false,
      json: () => Promise.resolve(r.data),
    });
  });
}

beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('useAdmin — initial load', () => {
  it('loads settings and users on mount', async () => {
    mockFetch([
      { data: { settings: mockSettings } },
      { data: { users: mockUsers } },
    ]);
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual(mockSettings);
    expect(result.current.users).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('sets error when settings fetch returns non-2xx', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Forbidden' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ users: mockUsers }) });
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.settings).toEqual({});
  });
});

describe('useAdmin — saveSettings', () => {
  it('PATCHes /api/admin/settings and updates settings state', async () => {
    mockFetch([
      { data: { settings: mockSettings } },
      { data: { users: mockUsers } },
      { data: { settings: { ...mockSettings, restaurant_name: 'New Name' } } },
    ]);
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out;
    await act(async () => {
      out = await result.current.saveSettings({ restaurant_name: 'New Name' });
    });
    expect(out.ok).toBe(true);
    expect(result.current.settings.restaurant_name).toBe('New Name');
  });
});

describe('useAdmin — promoteUser', () => {
  it('PATCHes role and updates user in state', async () => {
    mockFetch([
      { data: { settings: mockSettings } },
      { data: { users: mockUsers } },
      { data: { ok: true } },
    ]);
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out;
    await act(async () => {
      out = await result.current.promoteUser(2, 'manager');
    });
    expect(out.ok).toBe(true);
    const updated = result.current.users.find(u => u.id === 2);
    expect(updated.role).toBe('manager');
  });
});

describe('useAdmin — hardDelete', () => {
  it('DELETEs user and removes from state', async () => {
    mockFetch([
      { data: { settings: mockSettings } },
      { data: { users: mockUsers } },
      { data: { ok: true } },
    ]);
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out;
    await act(async () => {
      out = await result.current.hardDelete(2);
    });
    expect(out.ok).toBe(true);
    expect(result.current.users.find(u => u.id === 2)).toBeUndefined();
  });

  it('does not remove user from state on error', async () => {
    mockFetch([
      { data: { settings: mockSettings } },
      { data: { users: mockUsers } },
      { ok: false, data: { error: 'User has shifts in published schedules.' } },
    ]);
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.hardDelete(2);
    });
    expect(result.current.users.find(u => u.id === 2)).toBeDefined();
  });
});

describe('useAdmin — getLoginHistory', () => {
  it('fetches and returns events array', async () => {
    const events = [{ id: 1, logged_in_at: 1717000000 }];
    mockFetch([
      { data: { settings: mockSettings } },
      { data: { users: mockUsers } },
      { data: { events } },
    ]);
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let history;
    await act(async () => {
      history = await result.current.getLoginHistory(2);
    });
    expect(history).toEqual(events);
  });
});

describe('useAdmin — resetPin', () => {
  it('POSTs to regenerate-link and returns claimUrl', async () => {
    mockFetch([
      { data: { settings: mockSettings } },
      { data: { users: mockUsers } },
      { data: { claimUrl: 'https://example.com/claim?token=abc123' } },
    ]);
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out;
    await act(async () => {
      out = await result.current.resetPin(2);
    });
    expect(out.ok).toBe(true);
    expect(out.claimUrl).toBe('https://example.com/claim?token=abc123');
  });
});
