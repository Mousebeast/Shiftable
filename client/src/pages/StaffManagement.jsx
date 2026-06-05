import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useStaff } from '../hooks/useStaff';
import { useGroups } from '../hooks/useGroups';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ROLE_OPTIONS = ['staff', 'manager'];

function RoleBadge({ role }) {
  const color = role === 'manager' ? 'text-blue-400 bg-blue-900/30' : 'text-gray-400 bg-gray-700';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{role}</span>;
}

function StatusBadge({ isActive }) {
  return isActive
    ? <span className="text-xs px-2 py-0.5 rounded-full text-green-400 bg-green-900/30">Active</span>
    : <span className="text-xs px-2 py-0.5 rounded-full text-gray-500 bg-gray-800">Inactive</span>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatPhoneDisplay(value) {
  const d = value.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function toE164(display) {
  const digits = display.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : '';
}

function fromE164(e164) {
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  const local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  return formatPhoneDisplay(local);
}

function StaffModal({ user, groups, onSave, onClose }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: fromE164(user?.phone ?? ''),
    role: user?.role ?? 'staff',
    minHours: user?.min_hours_per_week ?? 0,
    maxHours: user?.max_hours_per_week ?? 40,
    groupIds: user?.groups?.map(g => g.id) ?? [],
  });
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const emailError = form.email && !EMAIL_RE.test(form.email) ? 'Enter a valid email address' : null;
  const phoneDigits = form.phone.replace(/\D/g, '');
  const phoneError = form.phone && phoneDigits.length !== 10 ? 'Enter a 10-digit US number' : null;
  const isValid = !emailError && !phoneError && form.name && form.email;

  function toggleGroup(gid) {
    setForm(prev => ({
      ...prev,
      groupIds: prev.groupIds.includes(gid)
        ? prev.groupIds.filter(id => id !== gid)
        : [...prev.groupIds, gid],
    }));
  }

  function touch(key) {
    setTouched(prev => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);
    setError('');
    const result = await onSave({
      ...form,
      phone: form.phone ? toE164(form.phone) : '',
      minHours: Number(form.minHours),
      maxHours: Number(form.maxHours),
    });
    setSaving(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.data?.error || 'Failed to save');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-bold text-gray-100">{isEdit ? 'Edit Staff' : 'Add Staff'}</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              type="text"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              onBlur={() => touch('email')}
              required
              className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-100 ${touched.email && emailError ? 'border-red-500' : 'border-gray-600'}`}
            />
            {touched.email && emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Phone <span className="text-gray-600">(optional — for SMS)</span></label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: formatPhoneDisplay(e.target.value) }))}
              onBlur={() => touch('phone')}
              placeholder="(212) 555-1234"
              className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-100 ${touched.phone && phoneError ? 'border-red-500' : 'border-gray-600'}`}
            />
            {touched.phone && phoneError
              ? <p className="text-red-400 text-xs mt-1">{phoneError}</p>
              : <p className="text-gray-600 text-xs mt-1">US numbers only — digits auto-format as you type</p>
            }
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Role</label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100"
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Min hrs/wk</label>
              <input
                type="number" min={0} max={84}
                value={form.minHours}
                onChange={e => setForm(p => ({ ...p, minHours: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Max hrs/wk</label>
              <input
                type="number" min={0} max={84}
                value={form.maxHours}
                onChange={e => setForm(p => ({ ...p, maxHours: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
            </div>
          </div>
          {groups.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Groups</label>
              <div className="space-y-1">
                {groups.map(g => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.groupIds.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="accent-blue-500"
                    />
                    <span
                      className="w-3 h-3 rounded-sm inline-block"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="text-sm text-gray-300">{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-gray-400 border border-gray-600 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving || !isValid} className="flex-1 py-2 text-sm font-medium bg-blue-700 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FixedScheduleModal({ user, onClose }) {
  const [schedules, setSchedules] = useState(null);
  const [allTemplates, setAllTemplates] = useState([]);
  const [saving, setSaving] = useState({});

  // Load fixed schedules + templates for user's groups
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const userGroupIds = user.groups.map(g => g.id);
    Promise.all([
      fetch(`/api/users/${user.id}/fixed-schedules`, { credentials: 'include', signal }).then(r => r.json()),
      ...userGroupIds.map(gid =>
        fetch(`/api/groups/${gid}`, { credentials: 'include', signal })
          .then(r => r.json())
          .then(d => d.templates.map(t => ({ ...t, group_name: d.group.name })))
      ),
    ]).then(([schedData, ...templateArrays]) => {
      setSchedules(schedData.schedules);
      setAllTemplates(templateArrays.flat());
    }).catch(() => {});
    return () => controller.abort();
  }, [user.id]);

  const fixedMap = schedules
    ? Object.fromEntries(schedules.map(s => [s.day_of_week, s.shift_template_id]))
    : {};

  async function handleDayChange(day, templateId) {
    setSaving(prev => ({ ...prev, [day]: true }));
    if (templateId === '') {
      if (fixedMap[day] != null) {
        const r = await fetch(`/api/users/${user.id}/fixed-schedules/${day}`, { method: 'DELETE', credentials: 'include' });
        if (r.ok) setSchedules(prev => prev.filter(s => s.day_of_week !== day));
      }
    } else {
      const r = await fetch(`/api/users/${user.id}/fixed-schedules/${day}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId: Number(templateId) }),
      });
      const d = await r.json();
      if (r.ok) {
        setSchedules(prev => {
          const without = prev.filter(s => s.day_of_week !== day);
          return [...without, d.schedule];
        });
      }
    }
    setSaving(prev => ({ ...prev, [day]: false }));
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-bold text-gray-100">Fixed Schedule — {user.name}</h3>
        {schedules === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-2">
            {DAY_NAMES.map((dayName, day) => (
              <div key={day} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-8">{dayName}</span>
                <select
                  value={fixedMap[day] ?? ''}
                  onChange={e => handleDayChange(day, e.target.value)}
                  disabled={saving[day]}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-100"
                >
                  <option value="">None</option>
                  {allTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.group_name} – {t.name} ({t.start_time}, {t.hours}h)</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full py-2 text-sm text-gray-400 border border-gray-600 rounded-lg">Close</button>
      </div>
    </div>
  );
}

export default function StaffManagement() {
  const { user } = useAuth();
  const { users, loading, error, createUser, updateUser, deactivateUser, regenerateLink } = useStaff();
  const { groups } = useGroups();

  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [fixedUser, setFixedUser] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  if (user?.role === 'staff') return <Navigate to="/" replace />;

  const visible = showInactive ? users : users.filter(u => u.is_active);

  async function handleCopyLink(u) {
    if (u.last_login_at) {
      const confirmed = window.confirm(
        `${u.name} has already claimed their account. Generating a new link will invalidate their current PIN — they'll need to set a new one. Continue?`
      );
      if (!confirmed) return;
    }
    const { ok, claimUrl } = await regenerateLink(u.id);
    if (ok && claimUrl) {
      navigator.clipboard?.writeText(claimUrl).catch(() => {});
      setCopiedId(u.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="sticky top-[57px] z-10 bg-gray-950 pb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-100">Staff Management</h2>
          <p className="text-xs text-gray-500">{users.filter(u => u.is_active).length} active staff</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(s => !s)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showInactive ? 'border-blue-500 text-blue-400' : 'border-gray-600 text-gray-400'}`}
          >
            {showInactive ? 'Hide inactive' : 'Show inactive'}
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg"
          >
            Add Staff
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm p-4">Loading…</p>
      ) : error ? (
        <p className="text-red-400 text-sm p-4">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-500 text-sm p-4">No staff found.</p>
      ) : (
        <div className="space-y-2">
          {visible.map(u => (
            <div key={u.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-100 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <RoleBadge role={u.role} />
                    <StatusBadge isActive={u.is_active} />
                    {u.groups.map(g => (
                      <span key={g.id} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: g.color + '33', color: g.color }}>{g.name}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setFixedUser(u)}
                    title="Fixed Schedule"
                    className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    📅
                  </button>
                  <button
                    onClick={() => setEditUser(u)}
                    title="Edit"
                    className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleCopyLink(u)}
                    title={copiedId === u.id ? 'Copied!' : 'Copy Claim Link'}
                    className={`p-1.5 rounded-lg transition-colors ${copiedId === u.id ? 'text-green-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}`}
                  >
                    🔗
                  </button>
                  {u.is_active && u.role !== 'admin' && u.id !== user.id && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Deactivate ${u.name}?`)) deactivateUser(u.id);
                      }}
                      title="Deactivate"
                      className="p-1.5 text-red-400 hover:text-red-300 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <StaffModal
          user={null}
          groups={groups}
          onSave={createUser}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editUser && (
        <StaffModal
          user={editUser}
          groups={groups}
          onSave={(data) => updateUser(editUser.id, data)}
          onClose={() => setEditUser(null)}
        />
      )}
      {fixedUser && (
        <FixedScheduleModal user={fixedUser} onClose={() => setFixedUser(null)} />
      )}
    </div>
  );
}
