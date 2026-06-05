import { renderHook, act, waitFor } from '@testing-library/react';
import { useGroups, useGroupDetail } from './useGroups';

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
});

const MOCK_GROUPS = [
  { id: 1, name: 'Servers', color: '#6366f1' },
  { id: 2, name: 'Bartenders', color: '#f59e0b' },
];

const MOCK_DETAIL = {
  group: { id: 1, name: 'Servers', color: '#6366f1' },
  templates: [{ id: 10, name: 'Lunch', start_time: '11:00', hours: 5 }],
  coverage: [{ id: 20, day_of_week: 0, shift_template_id: 10, min_staff: 2 }],
};

describe('useGroups', () => {
  it('loads groups on mount', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ groups: MOCK_GROUPS }) });
    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/groups', { credentials: 'include' });
  });

  it('createGroup adds group to list', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ groups: MOCK_GROUPS }) });
    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newGroup = { id: 3, name: 'Hosts', color: '#10b981' };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ group: newGroup }) });
    await act(async () => { await result.current.createGroup({ name: 'Hosts', color: '#10b981' }); });
    expect(result.current.groups).toHaveLength(3);
  });

  it('updateGroup replaces group in list', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ groups: MOCK_GROUPS }) });
    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = { ...MOCK_GROUPS[0], name: 'Servers Updated' };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ group: updated }) });
    await act(async () => { await result.current.updateGroup(1, { name: 'Servers Updated', color: '#6366f1' }); });
    expect(result.current.groups.find(g => g.id === 1).name).toBe('Servers Updated');
  });

  it('deleteGroup removes group from list', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ groups: MOCK_GROUPS }) });
    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await act(async () => { await result.current.deleteGroup(1); });
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].id).toBe(2);
  });

  it('sets error state when fetch fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load groups');
  });
});

describe('useGroupDetail', () => {
  it('does not fetch when groupId is null', () => {
    const { result } = renderHook(() => useGroupDetail(null));
    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads detail when groupId is provided', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_DETAIL });
    const { result } = renderHook(() => useGroupDetail(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.detail.templates).toHaveLength(1);
    expect(result.current.detail.coverage).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/groups/1', { credentials: 'include' });
  });

  it('addTemplate appends to templates list', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_DETAIL });
    const { result } = renderHook(() => useGroupDetail(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newTemplate = { id: 11, name: 'Dinner', start_time: '17:00', hours: 6 };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ template: newTemplate }) });
    await act(async () => { await result.current.addTemplate({ name: 'Dinner', startTime: '17:00', hours: 6 }); });
    expect(result.current.detail.templates).toHaveLength(2);
  });

  it('deleteTemplate removes from templates list', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_DETAIL });
    const { result } = renderHook(() => useGroupDetail(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    global.fetch.mockResolvedValueOnce({ ok: true });
    await act(async () => { await result.current.deleteTemplate(10); });
    expect(result.current.detail.templates).toHaveLength(0);
  });

  it('upsertCoverage adds new rule to coverage list', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_DETAIL });
    const { result } = renderHook(() => useGroupDetail(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newRule = { id: 21, day_of_week: 1, shift_template_id: 10, min_staff: 3 };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rule: newRule }) });
    await act(async () => { await result.current.upsertCoverage({ dayOfWeek: 1, templateId: 10, minStaff: 3 }); });
    expect(result.current.detail.coverage).toHaveLength(2);
  });

  it('upsertCoverage replaces existing rule with same day+template', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_DETAIL });
    const { result } = renderHook(() => useGroupDetail(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Same dayOfWeek:0 + templateId:10 as existing coverage[0] → should replace, not append
    const updatedRule = { id: 20, day_of_week: 0, shift_template_id: 10, min_staff: 4 };
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ rule: updatedRule }) });
    await act(async () => { await result.current.upsertCoverage({ dayOfWeek: 0, templateId: 10, minStaff: 4 }); });
    expect(result.current.detail.coverage).toHaveLength(1); // still 1, replaced not appended
    expect(result.current.detail.coverage[0].min_staff).toBe(4);
  });
});
