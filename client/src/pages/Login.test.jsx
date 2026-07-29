import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../hooks/useAuth';
import Login from './Login';

function renderLogin(loginFn = vi.fn()) {
  return render(
    <AuthContext.Provider value={{ user: null, loading: false, login: loginFn, logout: vi.fn() }}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('Login page', () => {
  // Login fetches /api/admin/settings/public on mount for the restaurant name.
  // A bare vi.fn() returns undefined and the effect throws on .then, so the
  // default mock has to resolve; individual tests override it for the login call.
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('renders PIN keypad buttons', () => {
    renderLogin();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows entered PIN as dots', () => {
    renderLogin();
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    const dots = screen.getAllByTestId('pin-dot');
    expect(dots.filter(d => d.classList.contains('bg-blue-400')).length).toBe(2);
  });

  it('calls /api/auth/login and invokes login on success', async () => {
    const loginFn = vi.fn();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, name: 'Alice', role: 'staff' }, restaurantName: 'Test Place' }),
    });
    renderLogin(loginFn);
    '1234'.split('').forEach(d => fireEvent.click(screen.getByText(d)));
    // login() takes the restaurant name as a second argument so the header can
    // show it immediately, without waiting for a follow-up settings fetch.
    await waitFor(() => expect(loginFn).toHaveBeenCalledWith(
      { id: 1, name: 'Alice', role: 'staff' }, 'Test Place',
    ));
  });

  it('shows error on invalid PIN', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid PIN' }),
    });
    renderLogin();
    '9999'.split('').forEach(d => fireEvent.click(screen.getByText(d)));
    await waitFor(() => expect(screen.getByText('Invalid PIN')).toBeInTheDocument());
  });
});
