import { renderHook, act, waitFor } from '@testing-library/react';
import { useStaff } from './useStaff';

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

const MOCK_USERS = [
  { id: 1, name: 'Alice', email: 'alice@test.com', role: 'staff', min_hours_per_week: 20, max_hours_per_week: 40, is_active: 1, has_claim_token: 0, groups: [] },
  { id: 2, name: 'Bob', email: 'bob@test.com', role: 'staff', min_hours_per_week: 0, max_hours_per_week: 40, is_active: 1, has_claim_token: 1, groups: [] },
];

describe('useStaff', () => {
  it('loads users on mount with includeInactive=true', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ users: MOCK_USERS }) });
    const { result } = renderHook(() => useStaff());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/users?includeInactive=true',
      { credentials: 'include' }
    );
  });

  it('createUser adds user to list on success', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ users: MOCK_USERS }) });
    const { result } = renderHook(() => useStaff());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newUser = { id: 3, name: 'Carol', email: 'carol@test.com', role: 'staff', is_active: 1, groups: [] };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: newUser, claimUrl: 'http://localhost/claim?token=abc' }) });
    let ret;
    await act(async () => {
      ret = await result.current.createUser({ name: 'Carol', email: 'carol@test.com', role: 'staff', minHours: 0, maxHours: 40, groupIds: [] });
    });
    expect(ret.ok).toBe(true);
    expect(ret.data.claimUrl).toBe('http://localhost/claim?token=abc');
    expect(result.current.users).toHaveLength(3);
  });

  it('updateUser replaces user in list on success', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ users: MOCK_USERS }) });
    const { result } = renderHook(() => useStaff());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = { ...MOCK_USERS[0], name: 'Alice Updated' };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: updated }) });
    await act(async () => {
      await result.current.updateUser(1, { name: 'Alice Updated', email: 'alice@test.com', role: 'staff', groupIds: [] });
    });
    expect(result.current.users.find(u => u.id === 1).name).toBe('Alice Updated');
  });

  it('deactivateUser marks user is_active=0 in list', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ users: MOCK_USERS }) });
    const { result } = renderHook(() => useStaff());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.deactivateUser(1); });
    expect(result.current.users.find(u => u.id === 1).is_active).toBe(0);
  });

  it('regenerateLink returns claimUrl', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ users: MOCK_USERS }) });
    const { result } = renderHook(() => useStaff());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ claimUrl: 'http://localhost/claim?token=xyz' }) });
    let ret;
    await act(async () => { ret = await result.current.regenerateLink(2); });
    expect(ret.ok).toBe(true);
    expect(ret.claimUrl).toBe('http://localhost/claim?token=xyz');
    expect(global.fetch).toHaveBeenCalledWith('/api/users/2/regenerate-link', expect.objectContaining({ method: 'POST' }));
  });

  it('sets error state when fetch fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useStaff());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load staff');
    expect(result.current.users).toHaveLength(0);
  });
});
