import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('starts in loading state', () => {
    global.fetch.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeUndefined();
  });

  it('sets user when /api/auth/me returns 200', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, name: 'Alice', role: 'staff' } }),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({ id: 1, name: 'Alice', role: 'staff' });
  });

  it('sets user to null when /api/auth/me returns 401', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('logout clears user', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: 1, name: 'Alice', role: 'staff' } }),
      })
      .mockResolvedValueOnce({ ok: true }); // logout response
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.logout(); });
    expect(result.current.user).toBeNull();
  });
});
