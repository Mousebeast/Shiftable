import { render, screen } from '@testing-library/react';
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
