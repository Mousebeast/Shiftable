import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstallBanner from './InstallBanner';

function setUA(ua) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

beforeEach(() => {
  // Default: not standalone
  Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  sessionStorage.clear();
  setUA('Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallBanner — iOS', () => {
  it('shows iOS banner on iPhone non-standalone', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15');
    render(<InstallBanner />);
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });

  it('does not show iOS banner when already standalone', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }); // standalone display-mode
    render(<InstallBanner />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });

  it('dismisses iOS banner and saves to sessionStorage', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15');
    render(<InstallBanner />);
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('installDismissed')).toBe('1');
  });

  it('does not show banner if already dismissed this session', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15');
    sessionStorage.setItem('installDismissed', '1');
    render(<InstallBanner />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });
});

describe('InstallBanner — Android / beforeinstallprompt', () => {
  it('shows install button when beforeinstallprompt fires', async () => {
    render(<InstallBanner />);
    const promptEvent = new Event('beforeinstallprompt');
    promptEvent.preventDefault = vi.fn();
    promptEvent.prompt = vi.fn();
    promptEvent.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(promptEvent);

    await waitFor(() => expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument());
  });

  it('calls prompt.prompt() when Install is clicked', async () => {
    render(<InstallBanner />);
    const promptEvent = new Event('beforeinstallprompt');
    promptEvent.preventDefault = vi.fn();
    promptEvent.prompt = vi.fn();
    promptEvent.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(promptEvent);

    await waitFor(() => screen.getByRole('button', { name: /install/i }));
    fireEvent.click(screen.getByRole('button', { name: /install/i }));
    expect(promptEvent.prompt).toHaveBeenCalled();
  });

  it('shows dismiss button alongside install button', async () => {
    render(<InstallBanner />);
    const promptEvent = new Event('beforeinstallprompt');
    promptEvent.preventDefault = vi.fn();
    promptEvent.prompt = vi.fn();
    promptEvent.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(promptEvent);

    await waitFor(() => screen.getByRole('button', { name: /install/i }));
    expect(screen.getByRole('button', { name: /×/ })).toBeInTheDocument();
  });
});
