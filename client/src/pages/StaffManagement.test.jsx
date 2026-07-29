import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

let mockUser = { id: 1, name: 'Manager', role: 'manager' };
let mockStaff = { users: [], loading: false, error: null, createUser: vi.fn(), updateUser: vi.fn(), deactivateUser: vi.fn(), regenerateLink: vi.fn() };
let mockGroups = { groups: [], loading: false };

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, logout: vi.fn() }) }));
vi.mock('../hooks/useStaff', () => ({ useStaff: () => mockStaff }));
vi.mock('../hooks/useGroups', () => ({ useGroups: () => mockGroups }));

import StaffManagement from './StaffManagement';

beforeEach(() => {
  mockUser = { id: 1, name: 'Manager', role: 'manager' };
  mockStaff = { users: [], loading: false, error: null, createUser: vi.fn(), updateUser: vi.fn(), deactivateUser: vi.fn(), regenerateLink: vi.fn() };
  mockGroups = { groups: [], loading: false };
});

describe('StaffManagement page', () => {
  it('shows heading for manager', () => {
    render(<MemoryRouter><StaffManagement /></MemoryRouter>);
    expect(screen.getByText(/Staff Management/i)).toBeTruthy();
  });

  it('shows loading state', () => {
    mockStaff = { ...mockStaff, loading: true };
    render(<MemoryRouter><StaffManagement /></MemoryRouter>);
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });

  it('redirects staff to home', () => {
    mockUser = { id: 2, name: 'Staff', role: 'staff' };
    render(<MemoryRouter><StaffManagement /></MemoryRouter>);
    expect(screen.queryByText(/Staff Management/i)).toBeNull();
  });

  it('shows Add Staff button for manager', () => {
    render(<MemoryRouter><StaffManagement /></MemoryRouter>);
    expect(screen.getByText(/Add Staff/i)).toBeTruthy();
  });
});

// Deactivation used to be one-way from the UI: the inactive list had no action
// buttons at all, and the ✕ on active cards is gated on u.is_active.
describe('StaffManagement — reactivating', () => {
  const HALEY = { id: 9, name: 'Haley', email: 'haley@test.com', role: 'staff', is_active: 0, groups: [] };

  function renderWithInactive(overrides = {}) {
    mockStaff = {
      ...mockStaff,
      users: [HALEY],
      reactivateUser: vi.fn().mockResolvedValue({ ok: true }),
      ...overrides,
    };
    render(<MemoryRouter><StaffManagement /></MemoryRouter>);
    fireEvent.click(screen.getByText(/Show inactive/i));
  }

  it('offers a Reactivate button on an inactive staff member', () => {
    renderWithInactive();
    expect(screen.getByText('Haley')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reactivate/i })).toBeTruthy();
  });

  it('does not offer one while the list is showing active staff', () => {
    mockStaff = { ...mockStaff, users: [{ ...HALEY, is_active: 1 }], reactivateUser: vi.fn() };
    render(<MemoryRouter><StaffManagement /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Reactivate/i })).toBeNull();
  });

  it('confirms before restoring, and does nothing if declined', () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithInactive();
    fireEvent.click(screen.getByRole('button', { name: /Reactivate/i }));
    expect(mockStaff.reactivateUser).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('calls the hook with the user id once confirmed', () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithInactive();
    fireEvent.click(screen.getByRole('button', { name: /Reactivate/i }));
    expect(mockStaff.reactivateUser).toHaveBeenCalledWith(9);
    spy.mockRestore();
  });

  it('surfaces a refusal rather than looking like a dead button', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithInactive({
      reactivateUser: vi.fn().mockResolvedValue({ ok: false, error: 'Only an admin can reactivate an admin account' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Reactivate/i }));
    expect(await screen.findByText(/Only an admin can reactivate/i)).toBeTruthy();
    spy.mockRestore();
  });
});

describe('StaffManagement — empty inactive list', () => {
  it('explains itself rather than showing a blank panel', () => {
    mockStaff = { ...mockStaff, users: [{ id: 1, name: 'Ava', email: 'a@t.com', role: 'staff', is_active: 1, groups: [] }], reactivateUser: vi.fn() };
    render(<MemoryRouter><StaffManagement /></MemoryRouter>);
    fireEvent.click(screen.getByText(/Show inactive/i));
    expect(screen.getByText(/No inactive staff\./i)).toBeTruthy();
  });
});
