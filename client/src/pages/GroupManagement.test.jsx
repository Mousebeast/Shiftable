import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

let mockUser = { id: 1, name: 'Manager', role: 'manager' };
let mockGroups = { groups: [], loading: false, error: null, createGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn() };
let mockStaff = { users: [], loading: false };
let mockDetail = { detail: null, loading: false, error: null, addTemplate: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn(), upsertCoverage: vi.fn(), deleteCoverage: vi.fn() };

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, logout: vi.fn() }) }));
vi.mock('../hooks/useGroups', () => ({ useGroups: () => mockGroups, useGroupDetail: () => mockDetail }));
vi.mock('../hooks/useStaff', () => ({ useStaff: () => mockStaff }));

import GroupManagement from './GroupManagement';

beforeEach(() => {
  mockUser = { id: 1, name: 'Manager', role: 'manager' };
  mockGroups = { groups: [], loading: false, error: null, createGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn() };
  mockStaff = { users: [], loading: false };
  mockDetail = { detail: null, loading: false, error: null, addTemplate: vi.fn(), updateTemplate: vi.fn(), deleteTemplate: vi.fn(), upsertCoverage: vi.fn(), deleteCoverage: vi.fn() };
});

describe('GroupManagement page', () => {
  it('shows heading for manager', () => {
    render(<MemoryRouter><GroupManagement /></MemoryRouter>);
    expect(screen.getByText(/Group Management/i)).toBeTruthy();
  });

  it('shows loading state', () => {
    mockGroups = { ...mockGroups, loading: true };
    render(<MemoryRouter><GroupManagement /></MemoryRouter>);
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });

  it('redirects staff to home', () => {
    mockUser = { id: 2, name: 'Staff', role: 'staff' };
    render(<MemoryRouter><GroupManagement /></MemoryRouter>);
    expect(screen.queryByText(/Group Management/i)).toBeNull();
  });

  it('shows Add Group button for manager', () => {
    render(<MemoryRouter><GroupManagement /></MemoryRouter>);
    expect(screen.getByText(/Add Group/i)).toBeTruthy();
  });
});
