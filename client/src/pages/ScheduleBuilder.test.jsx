import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

// Mutable state for per-test control
let mockUser = { id: 1, name: 'Manager', role: 'manager' };
let mockBuilder = {
  schedule: null, shifts: [], warnings: [],
  loading: false, generating: false, publishing: false, republishing: false,
  forking: false, discarding: false, error: null, violations: [], hasEdits: false,
  hasDraft: false, liveSchedule: null,
  generate: vi.fn(), publish: vi.fn(), republish: vi.fn(), fork: vi.fn(), discardDraft: vi.fn(),
  updateShift: vi.fn(), removeShift: vi.fn(), addShift: vi.fn(),
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}));

vi.mock('../hooks/useScheduleBuilder', () => ({
  useScheduleBuilder: () => mockBuilder,
}));

// Pin the current week so assertions do not drift with the calendar. Everything
// else in lib/week (DAY_NAMES, week arithmetic) stays real.
vi.mock('../lib/week', async (importOriginal) => ({
  ...(await importOriginal()),
  getWeekStartOf: () => '2026-06-01',
}));

import ScheduleBuilder from './ScheduleBuilder';

beforeEach(() => {
  mockUser = { id: 1, name: 'Manager', role: 'manager' };
  mockBuilder = {
    schedule: null, shifts: [], warnings: [],
    loading: false, generating: false, publishing: false, republishing: false,
    forking: false, discarding: false, error: null, violations: [], hasEdits: false,
    hasDraft: false, liveSchedule: null,
    generate: vi.fn(), publish: vi.fn(), republish: vi.fn(), fork: vi.fn(), discardDraft: vi.fn(),
    updateShift: vi.fn(), removeShift: vi.fn(), addShift: vi.fn(),
  };
});

describe('ScheduleBuilder page', () => {
  it('renders empty state with Generate button when no schedule exists', () => {
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    expect(screen.getByText(/No schedule for this week/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate/i })).toBeTruthy();
  });

  it('shows week label in header', () => {
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    expect(screen.getByText(/Week of/i)).toBeTruthy();
  });

  it('shows Generate and Publish buttons for a fresh draft (no shifts yet)', () => {
    mockBuilder = { ...mockBuilder, schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' }, hasDraft: false, liveSchedule: null };
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /^Generate$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Publish$/i })).toBeTruthy();
  });

  it('shows Re-Generate, Discard Draft, and Re-Publish buttons for a fork draft', () => {
    mockBuilder = {
      ...mockBuilder,
      schedule: { id: 2, status: 'draft', week_start_date: '2026-06-01' },
      hasDraft: true,
      liveSchedule: { id: 1, status: 'published', week_start_date: '2026-06-01' },
    };
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /Re-Generate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Discard Draft/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Re-Publish/i })).toBeTruthy();
    expect(screen.getByText(/Editing published schedule/i)).toBeTruthy();
  });

  it('shows Published label and Start Editing button when schedule is published', () => {
    mockBuilder = { ...mockBuilder, schedule: { id: 1, status: 'published', week_start_date: '2026-06-01' }, hasDraft: false };
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    expect(screen.getByText(/Published/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start Editing/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Generate$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Publish$/i })).toBeNull();
  });

  it('Discard Draft button is disabled while republishing', () => {
    mockBuilder = {
      ...mockBuilder,
      schedule: { id: 2, status: 'draft' },
      hasDraft: true,
      liveSchedule: { id: 1, status: 'published' },
      republishing: true,
    };
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    const discardBtn = screen.getByRole('button', { name: /Discard Draft/i });
    expect(discardBtn).toBeDisabled();
  });

  it('shows error message when error is set', () => {
    mockBuilder = { ...mockBuilder, error: 'A published schedule already exists for this week' };
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    expect(screen.getByText(/A published schedule already exists/i)).toBeTruthy();
  });
});

// The two caps the scheduler enforced but nothing re-checked after hand-edits.
// Each new violation type needs a shortViolation case, a dedup key and a tray
// bucket; miss one and it renders as a raw server message or is double-counted.
describe('ScheduleBuilder — shift-count and consecutive-day violations', () => {
  const SHIFTS = [
    { id: 11, user_id: 5, user_name: 'Ava Reyes', date: '2026-06-01', group_id: 1, group_name: 'Host', start_time: '16:00', hours: 4 },
    { id: 12, user_id: 5, user_name: 'Ava Reyes', date: '2026-06-02', group_id: 1, group_name: 'Host', start_time: '16:00', hours: 4 },
  ];

  function renderWith(violations) {
    mockBuilder = {
      ...mockBuilder,
      schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' },
      shifts: SHIFTS,
      violations,
    };
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    fireEvent.click(screen.getByText(/issue/i));
  }

  it('renders a shift-count breach in its own section, not as a raw message', () => {
    renderWith([
      { type: 'max_shifts', shiftId: 11, user_id: 5, user_name: 'Ava Reyes', message: 'Would exceed 3 shifts this week (4 total)' },
    ]);
    expect(screen.getByText(/Over Shift Limit/i)).toBeTruthy();
    expect(screen.getByText('Ava: 4 shifts (max 3)')).toBeTruthy();
  });

  it('renders a consecutive-day breach in its own section', () => {
    renderWith([
      { type: 'max_consecutive', shiftId: 11, user_id: 5, user_name: 'Ava Reyes', message: '6 days in a row, over the 5-day limit' },
    ]);
    expect(screen.getByText(/Consecutive Days/i)).toBeTruthy();
    expect(screen.getByText('Ava: 6 days in a row (max 5)')).toBeTruthy();
  });

  it('collapses a per-shift repeat into one entry per person', () => {
    // The server emits these on every shift the person has once the cap is
    // breached; the tray must not list the same fact twice.
    renderWith([
      { type: 'max_shifts', shiftId: 11, user_id: 5, user_name: 'Ava Reyes', message: 'Would exceed 3 shifts this week (4 total)' },
      { type: 'max_shifts', shiftId: 12, user_id: 5, user_name: 'Ava Reyes', message: 'Would exceed 3 shifts this week (4 total)' },
    ]);
    expect(screen.getAllByText('Ava: 4 shifts (max 3)')).toHaveLength(1);
    expect(screen.getByText(/⚠ 1 issue$/)).toBeTruthy();
  });

  it('still names the person when the violation arrives with no matching shift', () => {
    renderWith([
      { type: 'max_shifts', shiftId: null, user_id: 5, user_name: 'Ava Reyes', message: 'Would exceed 3 shifts this week (4 total)' },
    ]);
    expect(screen.getByText('Ava: 4 shifts (max 3)')).toBeTruthy();
  });
});

// Copy Week and Apply Template do no filtering, so a shift can land on time off
// approved since the source week. The grid used to hide it: the OFF marker only
// renders for an empty cell, so the one case that matters was the one suppressed.
describe('ScheduleBuilder — scheduled over approved time off', () => {
  const SHIFT = { id: 21, user_id: 5, user_name: 'Ava Reyes', date: '2026-06-03', group_id: 1, group_name: 'Host', start_time: '16:00', hours: 4 };

  function renderWith({ violations = [], timeOffDates = [] } = {}) {
    mockBuilder = {
      ...mockBuilder,
      schedule: { id: 1, status: 'draft', week_start_date: '2026-06-01' },
      shifts: [SHIFT],
      timeOffDates,
      violations,
    };
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
  }

  it('lists it under its own heading rather than as a raw message', () => {
    renderWith({ violations: [{ type: 'time_off', shiftId: 21, user_id: 5, date: '2026-06-03', message: 'Scheduled on approved time off' }] });
    fireEvent.click(screen.getByText(/issue/i));
    // Exact match: the entry text "on approved time off" also matches a loose regex.
    expect(screen.getByText('Approved Time Off')).toBeTruthy();
    expect(screen.getByText('Ava Wed: on approved time off')).toBeTruthy();
  });

  it('names the day from the carried date even with no matching shift', () => {
    renderWith({ violations: [{ type: 'time_off', shiftId: null, user_id: 5, date: '2026-06-03', message: 'Scheduled on approved time off' }] });
    fireEvent.click(screen.getByText(/issue/i));
    expect(screen.getByText(/Wed: on approved time off/i)).toBeTruthy();
  });

  it('marks the cell itself, so it is visible without opening the tray', () => {
    renderWith({ timeOffDates: [{ user_id: 5, date: '2026-06-03' }] });
    expect(screen.getByTitle('Scheduled on approved time off')).toBeTruthy();
  });

  it('leaves cells alone when the time off is on a day with no shift', () => {
    renderWith({ timeOffDates: [{ user_id: 5, date: '2026-06-04' }] });
    expect(screen.queryByTitle('Scheduled on approved time off')).toBeNull();
  });
});
