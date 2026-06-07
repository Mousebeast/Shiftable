import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

let mockUser = { id: 1, name: 'Manager', role: 'manager' };

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, logout: vi.fn() }) }));

// Mock fetch so the groups load doesn't error
beforeEach(() => {
  mockUser = { id: 1, name: 'Manager', role: 'manager' };
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ groups: [] }) });
});

afterEach(() => { vi.clearAllMocks(); });

import Broadcast from './Broadcast';

describe('Broadcast page', () => {
  it('shows heading for manager', async () => {
    render(<MemoryRouter><Broadcast /></MemoryRouter>);
    expect(screen.getByText(/Broadcast Message/i)).toBeTruthy();
  });

  it('redirects staff to home', () => {
    mockUser = { id: 2, name: 'Staff', role: 'staff' };
    render(<MemoryRouter><Broadcast /></MemoryRouter>);
    expect(screen.queryByText(/Broadcast Message/i)).toBeNull();
  });

  it('shows Send button for manager', () => {
    render(<MemoryRouter><Broadcast /></MemoryRouter>);
    expect(screen.getByText(/Send/i)).toBeTruthy();
  });
});
