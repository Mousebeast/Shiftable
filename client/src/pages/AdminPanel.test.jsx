import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPanel from './AdminPanel';

const mockSaveSettings = vi.fn().mockResolvedValue({ ok: true });
const mockPromoteUser = vi.fn().mockResolvedValue({ ok: true });
const mockHardDelete = vi.fn().mockResolvedValue({ ok: true });
const mockGetLoginHistory = vi.fn().mockResolvedValue([{ id: 1, logged_in_at: 1717000000 }]);
const mockResetPin = vi.fn().mockResolvedValue({ ok: true, claimUrl: 'https://example.com/claim?token=abc' });

vi.mock('../hooks/useAdmin', () => ({
  useAdmin: () => ({
    settings: {
      restaurant_name: 'Test Place',
      max_consecutive_days: '6',
      week_start_day: '0',
      smtp_host: '',
      smtp_port: '',
      smtp_user: '',
      smtp_password: '',
      app_url: '',
    },
    users: [
      { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin', is_active: 1, last_login_at: null },
      { id: 2, name: 'Staff User', email: 'staff@test.com', role: 'staff', is_active: 1, last_login_at: 1717000000 },
    ],
    loading: false,
    error: null,
    saveSettings: mockSaveSettings,
    promoteUser: mockPromoteUser,
    hardDelete: mockHardDelete,
    getLoginHistory: mockGetLoginHistory,
    resetPin: mockResetPin,
  }),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin', name: 'Admin User' } }),
}));

function renderPanel() {
  return render(<MemoryRouter><AdminPanel /></MemoryRouter>);
}

describe('AdminPanel — tabs', () => {
  it('renders three tab buttons', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /system/i })).toBeInTheDocument();
  });

  it('Settings tab is active by default', () => {
    renderPanel();
    expect(screen.getByDisplayValue('Test Place')).toBeInTheDocument();
  });
});

describe('AdminPanel — Settings tab', () => {
  it('shows restaurant name input', () => {
    renderPanel();
    expect(screen.getByDisplayValue('Test Place')).toBeInTheDocument();
  });

  it('shows SMTP host field', () => {
    renderPanel();
    expect(screen.getByLabelText(/smtp host/i)).toBeInTheDocument();
  });

  it('calls saveSettings with form data on submit', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalled());
  });
});

describe('AdminPanel — Users tab', () => {
  beforeEach(() => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /users/i }));
  });

  it('lists users with names and emails', () => {
    expect(screen.getByText('Staff User')).toBeInTheDocument();
    expect(screen.getByText('staff@test.com')).toBeInTheDocument();
  });

  it('shows Promote button for non-admin users', () => {
    expect(screen.getByRole('button', { name: /promote/i })).toBeInTheDocument();
  });

  it('shows Delete button for non-admin users', () => {
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('does not show Delete button for admin users', () => {
    const deleteButtons = screen.queryAllByRole('button', { name: /^delete$/i });
    expect(deleteButtons.length).toBe(1);
  });

  it('shows confirmation modal when Delete is clicked', () => {
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.getByText(/permanently delete user/i)).toBeInTheDocument();
    expect(screen.getAllByText('Staff User', { exact: false }).length).toBeGreaterThanOrEqual(1);
  });

  it('Delete Permanently button is disabled until name is typed', () => {
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    const confirmBtn = screen.getByRole('button', { name: /delete permanently/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('calls hardDelete after typing the correct name', async () => {
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    fireEvent.change(screen.getByPlaceholderText(/type name to confirm/i), {
      target: { value: 'Staff User' },
    });
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    await waitFor(() => expect(mockHardDelete).toHaveBeenCalledWith(2));
  });

  it('shows login history when History button is clicked', async () => {
    const historyBtns = screen.getAllByRole('button', { name: /history/i });
    fireEvent.click(historyBtns[0]);
    await waitFor(() => expect(mockGetLoginHistory).toHaveBeenCalled());
  });

  it('shows Reset PIN button', () => {
    expect(screen.getByRole('button', { name: /reset pin/i })).toBeInTheDocument();
  });
});

describe('AdminPanel — System tab', () => {
  it('shows Node Version label', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        nodeVersion: 'v18.19.1',
        uptime: '1h 0m 0s',
        uptimeSec: 3600,
        platform: 'linux',
        totalMemMb: 8192,
        freeMemMb: 4096,
      }),
    });
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /system/i }));
    await waitFor(() => expect(screen.getByText(/node version/i)).toBeInTheDocument());
  });

  it('shows Download Backup link', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /system/i }));
    expect(screen.getByRole('link', { name: /download backup/i })).toBeInTheDocument();
  });

  it('shows Clear Expired Claim Tokens button', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /system/i }));
    expect(screen.getByRole('button', { name: /clear expired claim tokens/i })).toBeInTheDocument();
  });
});
