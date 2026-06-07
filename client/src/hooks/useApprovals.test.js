import { renderHook, act, waitFor } from '@testing-library/react';
import { useApprovals } from './useApprovals';

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

const EMPTY = { timeoff: [], availability: [], swaps: [] };
const LOADED = {
  timeoff: [{ id: 1, user_id: 2, user_name: 'Alice', start_date: '2026-07-04', end_date: '2026-07-07', reason: 'Vacation', created_at: 1000 }],
  availability: [
    { id: 10, user_id: 3, user_name: 'Bob', day_of_week: 0, start_time: '10:00', end_time: '18:00', effective_from: '2026-06-08', created_at: 1000 },
    { id: 11, user_id: 3, user_name: 'Bob', day_of_week: 2, start_time: '10:00', end_time: '18:00', effective_from: '2026-06-08', created_at: 1000 },
  ],
  swaps: [{ id: 5, requester_name: 'Carol', claimer_name: 'Dave', date: '2026-06-01', start_time: '11:00', hours: 5, group_name: 'Server', group_color: '#6366f1' }],
};

describe('useApprovals', () => {
  it('loads pending items and groups availability rows by user+effective_from', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => LOADED });
    const { result } = renderHook(() => useApprovals());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pending.timeoff).toHaveLength(1);
    expect(result.current.pending.availabilityGroups).toHaveLength(1);
    expect(result.current.pending.availabilityGroups[0].rows).toHaveLength(2);
    expect(result.current.pending.swaps).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/approvals/pending', { credentials: 'include' });
  });

  it('removes time-off item optimistically after approveTimeOff', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => LOADED });
    const { result } = renderHook(() => useApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.approveTimeOff(1, ''); });

    expect(result.current.pending.timeoff).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith('/api/timeoff/1/approve', expect.objectContaining({ method: 'PATCH' }));
  });

  it('removes time-off item optimistically after denyTimeOff', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => LOADED });
    const { result } = renderHook(() => useApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.denyTimeOff(1, 'Sorry'); });

    expect(result.current.pending.timeoff).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith('/api/timeoff/1/deny', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ managerNote: 'Sorry' }) }));
  });

  it('removes availability group after approveAvailabilityGroup (calls approve for each row)', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => LOADED });
    const { result } = renderHook(() => useApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.approveAvailabilityGroup(result.current.pending.availabilityGroups[0]); });

    expect(result.current.pending.availabilityGroups).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith('/api/availability/10/approve', expect.objectContaining({ method: 'PATCH' }));
    expect(global.fetch).toHaveBeenCalledWith('/api/availability/11/approve', expect.objectContaining({ method: 'PATCH' }));
  });

  it('removes swap after approveSwap', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => LOADED });
    const { result } = renderHook(() => useApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.approveSwap(5); });

    expect(result.current.pending.swaps).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith('/api/swaps/5/approve', expect.objectContaining({ method: 'PATCH' }));
  });

  it('returns empty state when nothing is pending', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => EMPTY });
    const { result } = renderHook(() => useApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pending.timeoff).toHaveLength(0);
    expect(result.current.pending.availabilityGroups).toHaveLength(0);
    expect(result.current.pending.swaps).toHaveLength(0);
  });

  it('removes swap after denySwap', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => LOADED });
    const { result } = renderHook(() => useApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.denySwap(5); });

    expect(result.current.pending.swaps).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith('/api/swaps/5/deny', expect.objectContaining({ method: 'PATCH' }));
  });

  it('removes availability group after denyAvailabilityGroup (calls deny for each row)', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => LOADED });
    const { result } = renderHook(() => useApprovals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.denyAvailabilityGroup(result.current.pending.availabilityGroups[0]); });

    expect(result.current.pending.availabilityGroups).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledWith('/api/availability/10/deny', expect.objectContaining({ method: 'PATCH' }));
    expect(global.fetch).toHaveBeenCalledWith('/api/availability/11/deny', expect.objectContaining({ method: 'PATCH' }));
  });
});
