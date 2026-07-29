import { renderHook, act, waitFor } from '@testing-library/react';
import { useScheduleBuilder } from './useScheduleBuilder';

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useScheduleBuilder', () => {
  it('loads existing schedule from builder endpoint on mount', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' }, shifts: [] }),
    });

    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.schedule).toEqual({ id: 1, status: 'draft', week_start_date: '2026-06-01' });
    expect(result.current.shifts).toEqual([]);
    expect(result.current.warnings).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/schedule/builder?week=2026-06-01',
      { credentials: 'include' }
    );
  });

  it('returns null schedule when none exists', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: null, shifts: [] }),
    });

    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.schedule).toBeNull();
  });

  it('generate() calls POST /generate with the week and updates state', async () => {
    // Initial load: no schedule
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: null, shifts: [] }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Generate response
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' },
        shifts: [{ id: 10, user_id: 2, date: '2026-06-01' }],
        warnings: [{ group_id: 1, day_of_week: 0, needed: 2, assigned: 1 }],
      }),
    });

    await act(async () => { await result.current.generate(); });

    expect(global.fetch).toHaveBeenCalledWith('/api/schedule/generate', expect.objectContaining({
      method: 'POST',
      // mode defaults to 'full'; 'fixed-only' stops the scheduler after fixed
      // shifts and manual overrides.
      body: JSON.stringify({ week: '2026-06-01', force: false, mode: 'full' }),
    }));
    expect(result.current.schedule.status).toBe('draft');
    expect(result.current.shifts).toHaveLength(1);
    expect(result.current.warnings).toHaveLength(1);
    expect(result.current.warnings[0].needed).toBe(2);
  });

  it('generate() forwards mode=fixed-only', async () => {
    // Catch-all first so the auto-validate effect (which fires on every new
    // schedule id) always has something to resolve. Without it the mock queue
    // empties and `r.ok` throws on undefined — the source of the unhandled
    // rejections the older tests in this file leak.
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ warnings: [], violations: [] }) });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: null, shifts: [] }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' },
        shifts: [{ id: 10, user_id: 2, date: '2026-06-01', is_fixed: 1 }],
        warnings: [],
      }),
    });

    await act(async () => { await result.current.generate({ mode: 'fixed-only' }); });

    expect(global.fetch).toHaveBeenCalledWith('/api/schedule/generate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ week: '2026-06-01', force: false, mode: 'fixed-only' }),
    }));
  });

  it('generate() sets generating=true while in flight', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: null, shifts: [] }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveGenerate;
    global.fetch.mockImplementationOnce(
      () => new Promise(resolve => { resolveGenerate = () => resolve({ ok: true, json: async () => ({ schedule: null, shifts: [], warnings: [] }) }); })
    );

    act(() => { result.current.generate(); });
    expect(result.current.generating).toBe(true);

    await act(async () => { resolveGenerate(); });
    expect(result.current.generating).toBe(false);
  });

  it('publish() calls PATCH /:id/publish and updates schedule status to published', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' }, shifts: [] }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: { id: 1, status: 'published', week_start_date: '2026-06-01' } }),
    });

    await act(async () => { await result.current.publish(1); });

    expect(global.fetch).toHaveBeenCalledWith('/api/schedule/1/publish', expect.objectContaining({
      method: 'PATCH',
    }));
    expect(result.current.schedule.status).toBe('published');
  });

  it('reloads when weekStart prop changes', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: null, shifts: [] }),
    });
    const { result, rerender } = renderHook(({ w }) => useScheduleBuilder(w), {
      initialProps: { w: '2026-06-01' },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: { id: 2, status: 'draft', week_start_date: '2026-06-08' }, shifts: [] }),
    });
    rerender({ w: '2026-06-08' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.schedule.week_start_date).toBe('2026-06-08');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/schedule/builder?week=2026-06-08',
      { credentials: 'include' }
    );
  });

  it('generate() sets error when server returns non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: null, shifts: [] }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'A published schedule already exists for this week' }),
    });

    await act(async () => { await result.current.generate(); });

    expect(result.current.error).toBe('A published schedule already exists for this week');
    expect(result.current.generating).toBe(false);
  });

  it('publish() sets error when server returns non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' }, shifts: [] }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Only draft schedules can be published' }),
    });

    await act(async () => { await result.current.publish(1); });

    expect(result.current.error).toBe('Only draft schedules can be published');
    expect(result.current.publishing).toBe(false);
  });

  it('exposes error=null initially', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schedule: null, shifts: [] }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('fork calls POST /:id/fork and updates hasDraft state', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schedule: { id: 2, status: 'draft' },
        shifts: [],
        hasDraft: true,
        liveSchedule: { id: 1, status: 'published' },
      }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-02'));
    await act(async () => { await result.current.fork(1); });
    expect(result.current.hasDraft).toBe(true);
    expect(result.current.liveSchedule).toBeDefined();
    expect(result.current.liveSchedule.id).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/1/fork'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('discardDraft calls DELETE /:id/draft and clears hasDraft', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schedule: { id: 1, status: 'published' },
        shifts: [],
        hasDraft: false,
        liveSchedule: null,
      }),
    });
    const { result } = renderHook(() => useScheduleBuilder('2026-06-02'));
    await act(async () => { await result.current.discardDraft(2); });
    expect(result.current.hasDraft).toBe(false);
    expect(result.current.liveSchedule).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/2/draft'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('discardDraft clears warnings, not just violations', async () => {
    // The Schedule tab badge sums warnings + violations and renders outside the
    // schedule branch, so a leftover warnings array keeps a count lit on the
    // empty-state screen — where there is no grid, no tray, and nothing to
    // clear it. Nothing else replaces the array either: the auto-validate
    // effect keys on schedule.id, which is null once the draft is gone.
    // Catch-all first, then the specific first response — see the note above.
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        schedule: null,
        shifts: [],
        hasDraft: false,
        liveSchedule: null,
        warnings: [{ type: 'coverage_gap', message: 'Short 2 on Friday' }],
        violations: [],
      }),
    });
    fetch.mockResolvedValueOnce({ // initial load, with warnings present
      ok: true,
      json: async () => ({
        schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' },
        shifts: [],
        warnings: [{ type: 'coverage_gap', message: 'Short 2 on Friday' }],
      }),
    });

    const { result } = renderHook(() => useScheduleBuilder('2026-06-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.discardDraft(1); });

    // Asserted even though the discard response above still carries warnings —
    // the point is that the client drops them regardless of what comes back.
    expect(result.current.warnings).toEqual([]);
    expect(result.current.violations).toEqual([]);
  });
});
