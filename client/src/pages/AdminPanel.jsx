import { useState, useEffect, useRef } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useAuth } from '../hooks/useAuth';

const TABS = ['Settings', 'Users', 'Email/SMS', 'System'];

export default function AdminPanel() {
  const [tab, setTab] = useState('Settings');
  const { settings, users, loading, error, saveSettings, promoteUser, hardDelete, getLoginHistory, resetPin } = useAdmin();
  const { user: currentUser } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400">Loading…</div>;
  }
  if (error) {
    return <div className="p-6 text-red-400">{error}</div>;
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-100 mb-4">Admin Panel</h1>

      <div className="flex border-b border-gray-700 mb-6" role="tablist">
        {TABS.map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Settings' && (
        <SettingsTab settings={settings} saveSettings={saveSettings} />
      )}
      {tab === 'Users' && (
        <UsersTab
          users={users}
          currentUserId={currentUser?.id}
          promoteUser={promoteUser}
          hardDelete={hardDelete}
          getLoginHistory={getLoginHistory}
          resetPin={resetPin}
        />
      )}
      {tab === 'Email/SMS' && (
        <MessagingTab settings={settings} saveSettings={saveSettings} />
      )}
      {tab === 'System' && <SystemTab settings={settings} />}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ settings, saveSettings }) {
  const [form, setForm] = useState({
    restaurant_name: '',
    app_url: '',
    max_consecutive_days: '6',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (settings) setForm(prev => ({ ...prev, ...settings }));
  }, [settings]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function set(key) {
    return e => setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  function textField(label, key, type = 'text') {
    const id = `setting-${key}`;
    return (
      <div className="mb-4">
        <label htmlFor={id} className="block text-sm text-gray-400 mb-1">{label}</label>
        <input
          id={id}
          type={type}
          value={form[key] ?? ''}
          onChange={set(key)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const payload = {
      restaurant_name: form.restaurant_name,
      app_url: form.app_url,
      max_consecutive_days: form.max_consecutive_days,
    };
    const result = await saveSettings(payload);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError(result.data?.error || 'Save failed');
    }
  }

  return (
    <form onSubmit={handleSave}>
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">General</h2>
      {textField('Restaurant Name', 'restaurant_name')}
      {textField('App URL', 'app_url')}
      {textField('Max Consecutive Days', 'max_consecutive_days', 'number')}

      {saveError && <p className="text-red-400 text-sm mb-3">{saveError}</p>}
      {saved && <p className="text-green-400 text-sm mb-3">Settings saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </form>
  );
}

// ── Messaging Tab (Email + SMS) ───────────────────────────────────────────────

function MessagingTab({ settings, saveSettings }) {
  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: '',
    smtp_user: '',
    smtp_password: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_from_number: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (settings) setForm(prev => ({ ...prev, ...settings }));
  }, [settings]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function set(key) {
    return e => setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  function textField(label, key, type = 'text') {
    const id = `msg-${key}`;
    return (
      <div className="mb-4">
        <label htmlFor={id} className="block text-sm text-gray-400 mb-1">{label}</label>
        <input
          id={id}
          type={type}
          value={form[key] ?? ''}
          onChange={set(key)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-400"
        />
      </div>
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const payload = {
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_user: form.smtp_user,
      twilio_account_sid: form.twilio_account_sid,
      twilio_from_number: form.twilio_from_number,
    };
    if (form.smtp_password !== '***') payload.smtp_password = form.smtp_password;
    if (form.twilio_auth_token !== '***') payload.twilio_auth_token = form.twilio_auth_token;
    const result = await saveSettings(payload);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError(result.data?.error || 'Save failed');
    }
  }

  return (
    <form onSubmit={handleSave}>
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Email (SMTP)</h2>
      <p className="text-xs text-gray-500 mb-4">Used to send claim links and PIN reset emails to staff.</p>
      {textField('SMTP Host', 'smtp_host')}
      {textField('SMTP Port', 'smtp_port', 'number')}
      {textField('SMTP User', 'smtp_user')}
      {textField('SMTP Password', 'smtp_password', 'password')}

      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4 mt-8">SMS (Twilio)</h2>
      <p className="text-xs text-gray-500 mb-4">Used to text claim links to staff who have a phone number on their account.</p>
      {textField('Account SID', 'twilio_account_sid')}
      {textField('Auth Token', 'twilio_auth_token', 'password')}
      {textField('From Number', 'twilio_from_number')}
      <p className="text-xs text-gray-500 -mt-2 mb-4">From number must be in E.164 format, e.g. +12125551234</p>

      {saveError && <p className="text-red-400 text-sm mb-3">{saveError}</p>}
      {saved && <p className="text-green-400 text-sm mb-3">Settings saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </form>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ users, currentUserId, promoteUser, hardDelete, getLoginHistory, resetPin }) {
  const [expandedId, setExpandedId] = useState(null);
  const [history, setHistory] = useState({});
  const [claimUrls, setClaimUrls] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [actionError, setActionError] = useState(null);
  const [roleTarget, setRoleTarget] = useState(null);

  // Staff <-> manager is routine and stays a one-click toggle. Anything
  // involving admin goes through a confirmation instead: granting admin hands
  // over the full database including every PIN hash, and removing it can lock
  // someone out of their own restaurant.
  async function applyRole(user, newRole) {
    setActionError(null);
    const result = await promoteUser(user.id, newRole);
    if (!result.ok) setActionError(result.data?.error || 'Failed to change role');
    return result.ok;
  }

  async function handlePromote(user) {
    await applyRole(user, user.role === 'manager' ? 'staff' : 'manager');
  }

  async function handleRoleConfirm() {
    const ok = await applyRole(roleTarget.user, roleTarget.newRole);
    if (ok) setRoleTarget(null);
  }

  async function handleDeleteConfirm() {
    if (deleteConfirm.trim() !== deleteTarget.name.trim()) return;
    const result = await hardDelete(deleteTarget.id);
    if (result.ok) {
      setDeleteTarget(null);
      setDeleteConfirm('');
    } else {
      setActionError(result.data?.error || 'Delete failed');
      setDeleteTarget(null);
    }
  }

  async function toggleHistory(userId) {
    if (expandedId === userId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(userId);
    if (!history[userId]) {
      const events = await getLoginHistory(userId);
      setHistory(prev => ({ ...prev, [userId]: events }));
    }
  }

  async function handleResetPin(user) {
    setActionError(null);
    const result = await resetPin(user.id);
    if (result.ok) {
      setClaimUrls(prev => ({ ...prev, [user.id]: result.claimUrl }));
    } else {
      setActionError('Failed to generate reset link');
    }
  }

  // Staff/manager-only actions (PIN reset, hard delete, the routine role
  // toggle). Admin rows are excluded — admin role changes go through the
  // confirmation path below, and hard delete still refuses admins server-side.
  const canModify = (u) => u.role !== 'admin' && u.id !== currentUserId;

  // Admin grant/revoke. Never your own account — the server blocks self-changes
  // outright, since that is the one move that can strand the person making it.
  const canChangeAdmin = (u) => u.id !== currentUserId;

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
        All Users ({users.length})
      </h2>
      {actionError && <p className="text-red-400 text-sm mb-3">{actionError}</p>}

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="bg-gray-800 border border-gray-700 rounded p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-gray-100 font-medium text-sm">{u.name}</div>
                <div className="text-gray-400 text-xs">{u.email}</div>
                <div className="flex gap-2 mt-1 flex-wrap items-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    u.role === 'admin' ? 'bg-purple-900 text-purple-300' :
                    u.role === 'manager' ? 'bg-blue-900 text-blue-300' :
                    'bg-gray-700 text-gray-300'
                  }`}>{u.role}</span>
                  {!u.is_active && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-900 text-red-300">inactive</span>
                  )}
                  {u.last_login_at && (
                    <span className="text-xs text-gray-500">
                      Last: {new Date(u.last_login_at * 1000).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                {canModify(u) && (
                  <>
                    <button
                      onClick={() => handlePromote(u)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded"
                    >
                      {u.role === 'manager' ? 'Demote' : 'Promote'}
                    </button>
                    <button
                      onClick={() => handleResetPin(u)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded"
                    >
                      Reset PIN
                    </button>
                  </>
                )}
                {canChangeAdmin(u) && (
                  <>
                    <button
                      onClick={() => {
                        setActionError(null);
                        setRoleTarget({
                          user: u,
                          newRole: u.role === 'admin' ? 'manager' : 'admin',
                        });
                      }}
                      className={`text-xs px-2 py-1 rounded ${
                        u.role === 'admin'
                          ? 'bg-purple-900 hover:bg-purple-800 text-purple-200'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      }`}
                    >
                      {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                    </button>
                  </>
                )}
                {canModify(u) && (
                  <>
                    <button
                      onClick={() => { setDeleteTarget(u); setDeleteConfirm(''); setActionError(null); }}
                      className="text-xs bg-red-900 hover:bg-red-800 text-red-200 px-2 py-1 rounded"
                    >
                      Delete
                    </button>
                  </>
                )}
                <button
                  onClick={() => toggleHistory(u.id)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 px-2 py-1 rounded"
                >
                  {expandedId === u.id ? 'Hide History' : 'History'}
                </button>
              </div>
            </div>

            {claimUrls[u.id] && (
              <div className="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-300 break-all">
                Reset link: <span className="text-blue-400">{claimUrls[u.id]}</span>
              </div>
            )}

            {expandedId === u.id && (
              <div className="mt-3 border-t border-gray-700 pt-3">
                <div className="text-xs text-gray-400 mb-1">Login History (last 20)</div>
                {history[u.id]?.length ? (
                  <ul className="space-y-0.5">
                    {history[u.id].map(ev => (
                      <li key={ev.id} className="text-xs text-gray-300">
                        {new Date(ev.logged_in_at * 1000).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500">No login history.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {roleTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-gray-100 font-semibold mb-2">
              {roleTarget.newRole === 'admin' ? 'Grant Admin Access' : 'Revoke Admin Access'}
            </h3>
            {roleTarget.newRole === 'admin' ? (
              <p className="text-gray-400 text-sm mb-4">
                <strong className="text-gray-200">{roleTarget.user.name}</strong> will get full
                access: app settings, every staff record, and a download of the entire database.
                Only grant this to someone you trust with all of it.
              </p>
            ) : (
              <p className="text-gray-400 text-sm mb-4">
                <strong className="text-gray-200">{roleTarget.user.name}</strong> will drop to
                manager and lose access to settings, backups, and staff records. They keep their
                schedule and shifts.
              </p>
            )}
            {actionError && <p className="text-red-400 text-sm mb-3">{actionError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setRoleTarget(null); setActionError(null); }}
                className="text-sm text-gray-400 hover:text-gray-200 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleRoleConfirm}
                className={`text-sm text-white px-4 py-1.5 rounded ${
                  roleTarget.newRole === 'admin'
                    ? 'bg-purple-700 hover:bg-purple-600'
                    : 'bg-amber-700 hover:bg-amber-600'
                }`}
              >
                {roleTarget.newRole === 'admin' ? 'Grant Admin' : 'Revoke Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-gray-100 font-semibold mb-2">Permanently Delete User</h3>
            <p className="text-gray-400 text-sm mb-4">
              This cannot be undone. All data for this user will be deleted.
              Type <strong className="text-gray-200">{deleteTarget.name}</strong> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type name to confirm"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 text-sm mb-4 focus:outline-none focus:border-red-400"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}
                className="text-sm text-gray-400 hover:text-gray-200 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteConfirm.trim() !== deleteTarget.name.trim()}
                className="text-sm bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white px-4 py-1.5 rounded"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Version Check ─────────────────────────────────────────────────────────────

function VersionCheck() {
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { check(); }, []);

  function check() {
    setChecking(true);
    fetch('/api/admin/version', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => setInfo({ current: 'unknown', latest: null, updateAvailable: false, installDir: '' }))
      .finally(() => setChecking(false));
  }

  if (checking && !info) return <p className="text-gray-500 text-sm">Checking…</p>;
  if (!info) return null;

  return (
    <div className="space-y-3">
      <dl className="space-y-2">
        <div className="flex gap-4 text-sm">
          <dt className="text-gray-400 w-32 flex-shrink-0">Installed</dt>
          <dd className="text-gray-100 font-mono">v{info.current}</dd>
        </div>
        {info.latest && (
          <div className="flex gap-4 text-sm">
            <dt className="text-gray-400 w-32 flex-shrink-0">Latest</dt>
            <dd className="text-gray-100 font-mono">v{info.latest}</dd>
          </div>
        )}
      </dl>
      {info.updateAvailable && (
        <div className="bg-blue-950 border border-blue-700 rounded p-3 space-y-2">
          <p className="text-blue-300 text-sm font-medium">Update available — v{info.latest}</p>
          <p className="text-gray-400 text-xs">Run this on your server:</p>
          <code className="block bg-gray-900 text-green-400 text-xs px-3 py-2 rounded font-mono select-all break-all">
            sudo bash {info.installDir}/update.sh
          </code>
        </div>
      )}
      {!info.updateAvailable && info.latest && (
        <p className="text-green-400 text-sm">Up to date</p>
      )}
      {!info.latest && (
        <p className="text-gray-500 text-sm">Release check unavailable</p>
      )}
      <button onClick={check} disabled={checking}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 active:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-1">
        {checking ? 'Checking…' : 'Check for updates'}
      </button>
    </div>
  );
}

// ── System Tab ────────────────────────────────────────────────────────────────

function MigrationSection({ settings }) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState(null);
  const [copied, setCopied] = useState(null);
  const fileRef = useRef(null);
  const copyTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    setEmailResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const r = await fetch('/api/admin/import-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ data }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Import failed');
      setImportResult(d);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSendEmails() {
    if (!importResult) return;
    setSendingEmails(true);
    setEmailResult(null);
    try {
      const r = await fetch('/api/admin/send-welcome-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userIds: importResult.staff.map(s => s.id) }),
      });
      const d = await r.json();
      setEmailResult(d);
    } catch {
      setEmailResult({ error: 'Failed to send emails' });
    } finally {
      setSendingEmails(false);
    }
  }

  async function handleResendClaimEmails() {
    setResending(true);
    setResendResult(null);
    try {
      const r = await fetch('/api/admin/resend-claim-emails', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json();
      setResendResult(d);
    } catch {
      setResendResult({ error: 'Request failed' });
    } finally {
      setResending(false);
    }
  }

  function handleCopy(id, url) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(id);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
    });
  }

  const smtpConfigured = !!settings?.smtp_host;

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2">Staff Migration</h2>
      <p className="text-xs text-gray-500 mb-4">
        Export your staff configuration from this instance, then import it on a fresh installation.
        Imported staff are set to unclaimed state — each person sets their PIN via their claim link.
      </p>

      <div className="flex gap-3 flex-wrap mb-4">
        <a
          href="/api/admin/export-staff"
          className="inline-block bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm px-4 py-2 rounded"
        >
          Export Staff Package
        </a>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-200 text-sm px-4 py-2 rounded"
        >
          {importing ? 'Importing…' : 'Import Staff Package'}
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>

      {smtpConfigured && (
        <div className="mb-4">
          <button
            onClick={handleResendClaimEmails}
            disabled={resending}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-200 text-sm px-4 py-2 rounded"
          >
            {resending ? 'Sending…' : 'Resend claim emails to unclaimed staff'}
          </button>
          {resendResult && (
            <p className={`text-xs mt-2 ${resendResult.error ? 'text-red-400' : 'text-green-400'}`}>
              {resendResult.error
                ? resendResult.error
                : resendResult.total === 0
                  ? 'No unclaimed staff found.'
                  : `Sent ${resendResult.sent} email${resendResult.sent !== 1 ? 's' : ''}${resendResult.failed ? `, ${resendResult.failed} failed` : ''} (${resendResult.total} unclaimed total)`}
            </p>
          )}
        </div>
      )}

      {importError && <p className="text-red-400 text-sm mb-4">{importError}</p>}

      {importResult && (
        <div className="bg-gray-900 border border-gray-700 rounded p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-green-400 text-sm font-medium">
              {importResult.imported} staff imported successfully
            </p>
            {smtpConfigured && (
              <button
                onClick={handleSendEmails}
                disabled={sendingEmails}
                className="text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded"
              >
                {sendingEmails ? 'Sending…' : 'Send welcome emails to all'}
              </button>
            )}
          </div>

          {emailResult && (
            <p className={`text-xs mb-3 ${emailResult.error ? 'text-red-400' : 'text-green-400'}`}>
              {emailResult.error
                ? emailResult.error
                : `Sent ${emailResult.sent} email${emailResult.sent !== 1 ? 's' : ''}${emailResult.failed ? `, ${emailResult.failed} failed` : ''}${emailResult.skipped ? `, ${emailResult.skipped} skipped (no email)` : ''}`}
            </p>
          )}

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {importResult.staff.map(s => (
              <div key={s.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-200 text-xs font-medium">{s.name}</span>
                    {s.email && <span className="text-gray-500 text-xs">{s.email}</span>}
                  </div>
                  <div className="text-blue-400 text-xs break-all mt-0.5">{s.claimUrl}</div>
                </div>
                <button
                  onClick={() => handleCopy(s.id, s.claimUrl)}
                  className="text-xs text-gray-400 hover:text-gray-200 flex-shrink-0 mt-0.5 transition-colors"
                >
                  {copied === s.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SystemTab({ settings }) {
  const [sysInfo, setSysInfo] = useState(null);
  const [sysError, setSysError] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(null);
  const [clearError, setClearError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/system', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setSysInfo(d); })
      .catch(() => { if (!cancelled) setSysError('Failed to load system info'); });
    return () => { cancelled = true; };
  }, []);

  async function handleClearTokens() {
    setClearing(true);
    setCleared(null);
    setClearError(null);
    try {
      const r = await fetch('/api/admin/maintenance/clear-tokens', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Request failed');
      setCleared(d.cleared);
    } catch (e) {
      setClearError(e.message);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Version</h2>
        <VersionCheck />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Server Info</h2>
        {sysError && <p className="text-red-400 text-sm">{sysError}</p>}
        {!sysInfo && !sysError && <p className="text-gray-500 text-sm">Loading…</p>}
        {sysInfo && (
          <dl className="space-y-2">
            {[
              ['Node Version', sysInfo.nodeVersion],
              ['Uptime', sysInfo.uptime],
              ['Platform', sysInfo.platform],
              ['Total Memory', `${sysInfo.totalMemMb} MB`],
              ['Free Memory', `${sysInfo.freeMemMb} MB`],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-4 text-sm">
                <dt className="text-gray-400 w-32 flex-shrink-0">{label}</dt>
                <dd className="text-gray-100 font-mono">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Database</h2>
        <a
          href="/api/admin/backup"
          className="inline-block bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm px-4 py-2 rounded"
        >
          Download Backup
        </a>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">Maintenance</h2>
        <button
          onClick={handleClearTokens}
          disabled={clearing}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-200 text-sm px-4 py-2 rounded"
        >
          {clearing ? 'Clearing…' : 'Clear Expired Claim Tokens'}
        </button>
        {cleared !== null && (
          <p className="text-green-400 text-sm mt-2">
            Cleared {cleared} expired token{cleared !== 1 ? 's' : ''}.
          </p>
        )}
        {clearError && (
          <p className="text-red-400 text-sm mt-2">{clearError}</p>
        )}
      </div>

      <MigrationSection settings={settings} />
    </div>
  );
}
