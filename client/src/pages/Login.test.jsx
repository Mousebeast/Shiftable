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
  beforeEach(() => { global.fetch = vi.fn(); });

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
    expect(dots.filter(d => d.classList.contains('bg-gray-200')).length).toBe(2);
  });

  it('calls /api/auth/login and invokes login on success', async () => {
    const loginFn = vi.fn();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 1, name: 'Alice', role: 'staff' } }),
    });
    renderLogin(loginFn);
    '1234'.split('').forEach(d => fireEvent.click(screen.getByText(d)));
    await waitFor(() => expect(loginFn).toHaveBeenCalledWith({ id: 1, name: 'Alice', role: 'staff' }));
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
