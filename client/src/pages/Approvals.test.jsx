import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

let mockUser = { id: 1, name: 'Manager', role: 'manager' };
let mockPending = { timeoff: [], availabilityGroups: [], swaps: [] };
let mockLoading = false;

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}));

vi.mock('../hooks/useApprovals', () => ({
  useApprovals: () => ({
    pending: mockPending,
    loading: mockLoading,
    approveTimeOff: vi.fn(), denyTimeOff: vi.fn(),
    approveAvailabilityGroup: vi.fn(), denyAvailabilityGroup: vi.fn(),
    approveSwap: vi.fn(), denySwap: vi.fn(),
    // Cards read processing.has(...) to disable buttons mid-request. Omitting it
    // makes every card throw on render.
    processing: new Set(),
  }),
}));

import Approvals from './Approvals';

beforeEach(() => {
  mockUser = { id: 1, name: 'Manager', role: 'manager' };
  mockPending = { timeoff: [], availabilityGroups: [], swaps: [] };
  mockLoading = false;
});

describe('Approvals page', () => {
  it('shows all-caught-up message when nothing is pending', () => {
    render(<MemoryRouter><Approvals /></MemoryRouter>);
    expect(screen.getByText(/All caught up/i)).toBeTruthy();
  });

  it('shows time-off card when pending timeoff exists', () => {
    mockPending = {
      timeoff: [{ id: 1, user_name: 'Alice', start_date: '2026-07-04', end_date: '2026-07-07', reason: 'Vacation', created_at: 1000 }],
      availabilityGroups: [],
      swaps: [],
    };
    render(<MemoryRouter><Approvals /></MemoryRouter>);
    expect(screen.getByText(/Alice/i)).toBeTruthy();
    expect(screen.getByText(/Vacation/i)).toBeTruthy();
  });

  it('redirects staff to home', () => {
    mockUser = { id: 2, name: 'Staff', role: 'staff' };
    render(<MemoryRouter><Approvals /></MemoryRouter>);
    expect(screen.queryByText(/Pending Approvals/i)).toBeNull();
  });

  it('shows loading state', () => {
    mockLoading = true;
    render(<MemoryRouter><Approvals /></MemoryRouter>);
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });
});
