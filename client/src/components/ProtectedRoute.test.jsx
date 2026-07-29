import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';

let mockAuth = { user: null, loading: false };

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

import ProtectedRoute from './ProtectedRoute';

// Renders a guarded /builder alongside the two routes it can redirect to, so the
// assertions check where the user actually lands rather than a mocked Navigate.
function renderGuarded(roles) {
  return render(
    <MemoryRouter initialEntries={['/builder']}>
      <Routes>
        <Route path="/builder" element={
          <ProtectedRoute roles={roles}><div>Builder Content</div></ProtectedRoute>
        } />
        <Route path="/" element={<div>Dashboard</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockAuth = { user: null, loading: false };
});

describe('ProtectedRoute', () => {
  it('shows a loading screen before auth resolves, without rendering children', () => {
    mockAuth = { user: undefined, loading: true };
    renderGuarded(['manager', 'admin']);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Builder Content')).toBeNull();
  });

  it('redirects to login when logged out', () => {
    mockAuth = { user: null, loading: false };
    renderGuarded(['manager', 'admin']);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Builder Content')).toBeNull();
  });

  // This is the guarantee the ScheduleBuilder component used to duplicate with
  // its own early return. Enforcement lives here, so the coverage does too.
  it('redirects a staff user away from a manager-only route', () => {
    mockAuth = { user: { id: 2, name: 'Staff', role: 'staff' }, loading: false };
    renderGuarded(['manager', 'admin']);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Builder Content')).toBeNull();
  });

  it('renders children for a manager', () => {
    mockAuth = { user: { id: 1, name: 'Manager', role: 'manager' }, loading: false };
    renderGuarded(['manager', 'admin']);
    expect(screen.getByText('Builder Content')).toBeInTheDocument();
  });

  it('renders children for an admin', () => {
    mockAuth = { user: { id: 3, name: 'Admin', role: 'admin' }, loading: false };
    renderGuarded(['manager', 'admin']);
    expect(screen.getByText('Builder Content')).toBeInTheDocument();
  });

  it('allows any logged-in role when no roles are specified', () => {
    mockAuth = { user: { id: 2, name: 'Staff', role: 'staff' }, loading: false };
    renderGuarded(undefined);
    expect(screen.getByText('Builder Content')).toBeInTheDocument();
  });
});
