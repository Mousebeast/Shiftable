import { render, screen } from '@testing-library/react';
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
