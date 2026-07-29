import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

// AvailabilityGrid is not exported — it renders inside ScheduleBuilder's
// Availability tab, so these drive it the way a manager does: open the page,
// switch tab, click a cell. That also keeps the tab wiring under test.

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Manager', role: 'manager' }, logout: vi.fn() }),
}));

vi.mock('../hooks/useScheduleBuilder', () => ({
  useScheduleBuilder: () => ({
    schedule: null, shifts: [], warnings: [], loading: false, generating: false,
    publishing: false, republishing: false, forking: false, discarding: false,
    error: null, violations: [], hasEdits: false, hasDraft: false, liveSchedule: null,
    generate: vi.fn(), publish: vi.fn(), republish: vi.fn(), fork: vi.fn(),
    discardDraft: vi.fn(), updateShift: vi.fn(), removeShift: vi.fn(), addShift: vi.fn(),
  }),
}));

// Pin the current week. handleSave stamps effectiveFrom with getWeekStartOf(new
// Date()), so this is also what the "applies from this week" assertions check.
const THIS_WEEK = '2026-06-01';
vi.mock('../lib/week', async (importOriginal) => ({
  ...(await importOriginal()),
  getWeekStartOf: () => THIS_WEEK,
}));

import ScheduleBuilder from './ScheduleBuilder';

const GROUP = { id: 7, name: 'Servers', color: '#3b82f6', priority: 0 };

function staffPayload(availability) {
  return { staff: [{ id: 42, name: 'Priya', groups: [GROUP], availability }] };
}

let fetchMock;

function mockFetch(payload) {
  fetchMock = vi.fn((url, opts = {}) => {
    if (String(url).includes('/api/availability/manager/all')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }), _opts: opts });
  });
  global.fetch = fetchMock;
}

// Requests the grid itself made, ignoring the initial load.
function writeCalls() {
  return fetchMock.mock.calls.filter(([url]) => /\/api\/availability\/manager\/\d+\/\d+$/.test(String(url)));
}

async function openGrid(user, payload) {
  mockFetch(payload);
  render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: /^Availability$/i }));
  await waitFor(() => expect(screen.getByText('Priya')).toBeTruthy());
}

async function openMondayPopover(user) {
  const row = screen.getByText('Priya').closest('tr');
  await user.click(within(row).getAllByRole('cell')[1]); // first day column
  await waitFor(() => expect(screen.getByRole('button', { name: /^Save$/i })).toBeTruthy());
}

let user;
beforeEach(() => {
  user = userEvent.setup();
});

describe('AvailabilityGrid — cell rendering', () => {
  it('shows the available hours for a day with a time range', async () => {
    await openGrid(user, staffPayload([{ day_of_week: 0, start_time: '09:00', end_time: '17:00', is_blocked: 0 }]));
    // Both ends render in one cell separated by a <br>.
    expect(screen.getByText(/9:00 AM/)).toBeTruthy();
    expect(screen.getByText(/5:00 PM/)).toBeTruthy();
  });

  it('shows Off for a blocked day', async () => {
    await openGrid(user, staffPayload([{ day_of_week: 0, start_time: '00:00', end_time: '00:00', is_blocked: 1 }]));
    expect(screen.getByText('Off')).toBeTruthy();
  });

  it('treats a full 00:00–23:59 span as no restriction rather than a range', async () => {
    await openGrid(user, staffPayload([{ day_of_week: 0, start_time: '00:00', end_time: '23:59', is_blocked: 0 }]));
    expect(screen.queryByText('Off')).toBeNull();
    expect(screen.queryByText(/12:00 AM/)).toBeNull();
  });

  it('says changes apply from this week, not next', async () => {
    await openGrid(user, staffPayload([]));
    expect(screen.getByText(/apply from this week/i)).toBeTruthy();
  });
});

describe('AvailabilityGrid — the popover states what the range means', () => {
  it('labels the time range as hours available', async () => {
    await openGrid(user, staffPayload([]));
    await openMondayPopover(user);
    // The whole point: an unlabelled range reads equally as "hours they cannot
    // work", and entering it that way silently inverts the meaning.
    expect(screen.getByText(/Available between/i)).toBeTruthy();
  });

  it('offers All day rather than Clear, naming the resulting state', async () => {
    await openGrid(user, staffPayload([{ day_of_week: 0, start_time: '09:00', end_time: '17:00', is_blocked: 0 }]));
    await openMondayPopover(user);
    expect(screen.getByRole('button', { name: /All day/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Clear$/i })).toBeNull();
  });

  it('hides the time range once the day is marked not available', async () => {
    await openGrid(user, staffPayload([]));
    await openMondayPopover(user);
    expect(screen.getByText(/Available between/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Not available/i }));
    expect(screen.queryByText(/Available between/i)).toBeNull();
  });

  it('does not offer All day for a day that has no pattern yet', async () => {
    await openGrid(user, staffPayload([]));
    await openMondayPopover(user);
    expect(screen.queryByRole('button', { name: /All day/i })).toBeNull();
  });
});

describe('AvailabilityGrid — saving', () => {
  it('stamps the manager edit with the current week, not next week', async () => {
    await openGrid(user, staffPayload([]));
    await openMondayPopover(user);
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(writeCalls().length).toBe(1));
    const [url, opts] = writeCalls()[0];
    expect(String(url)).toContain('/api/availability/manager/42/0');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toMatchObject({ effectiveFrom: THIS_WEEK, isBlocked: false });
  });

  it('sends isBlocked with zeroed times when marked not available', async () => {
    await openGrid(user, staffPayload([]));
    await openMondayPopover(user);
    await user.click(screen.getByRole('button', { name: /Not available/i }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(writeCalls().length).toBe(1));
    const body = JSON.parse(writeCalls()[0][1].body);
    expect(body).toMatchObject({ isBlocked: true, startTime: '00:00', endTime: '00:00' });
  });

  it('All day removes the pattern rather than writing a wide one', async () => {
    await openGrid(user, staffPayload([{ day_of_week: 0, start_time: '09:00', end_time: '17:00', is_blocked: 0 }]));
    await openMondayPopover(user);
    await user.click(screen.getByRole('button', { name: /All day/i }));

    await waitFor(() => expect(writeCalls().length).toBe(1));
    expect(writeCalls()[0][1].method).toBe('DELETE');
  });
});
