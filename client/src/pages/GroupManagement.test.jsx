import { render, screen, fireEvent } from '@testing-library/react';
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

  describe('group detail — Members section', () => {
    // Expanding a group requires a group to expand and a detail payload for it.
    function setupExpandedGroup() {
      mockGroups = {
        ...mockGroups,
        groups: [{ id: 7, name: 'Server', color: '#6366f1', priority: 0 }],
      };
      mockStaff = {
        users: [
          { id: 1, name: 'Alice', role: 'staff', is_active: 1, groups: [{ id: 7 }] },
          { id: 2, name: 'Bob', role: 'staff', is_active: 1, groups: [] },
          { id: 3, name: 'Gone', role: 'staff', is_active: 0, groups: [{ id: 7 }] },
        ],
        loading: false,
        updateUser: vi.fn(),
        updateMembership: vi.fn(),
      };
      mockDetail = { ...mockDetail, detail: { templates: [] } };
      render(<MemoryRouter><GroupManagement /></MemoryRouter>);
      fireEvent.click(screen.getByTitle('Expand'));
    }

    it('hides the member checkboxes until the header is clicked', () => {
      setupExpandedGroup();
      expect(screen.getByText('Members')).toBeTruthy();
      expect(screen.queryByText('Alice')).toBeNull();

      fireEvent.click(screen.getByText('Members'));
      expect(screen.getByText('Alice')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('shows the membership count while collapsed', () => {
      // The point of collapsing: you still learn the membership without
      // opening it. A collapsed section that tells you nothing is a click tax.
      setupExpandedGroup();
      expect(screen.getByText('1 of 2')).toBeTruthy();
    });

    it('counts only active staff, so the count cannot exceed the total', () => {
      // 'Gone' is a deactivated member of the group. Counting them in the
      // numerator but not the denominator would render "2 of 2" — or worse,
      // "2 of 1" on a smaller roster.
      setupExpandedGroup();
      expect(screen.queryByText('2 of 2')).toBeNull();
      expect(screen.getByText('1 of 2')).toBeTruthy();
    });

    it('leaves Shift Templates and the coverage note visible without a click', () => {
      setupExpandedGroup();
      expect(screen.getByText('Shift Templates')).toBeTruthy();
      expect(screen.getByText(/Coverage rules are managed/i)).toBeTruthy();
    });
  });
});
