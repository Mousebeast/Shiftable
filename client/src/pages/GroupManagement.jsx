import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGroups, useGroupDetail } from '../hooks/useGroups';
import { useStaff } from '../hooks/useStaff';
import TimeSelect, { toDisplayTime } from '../components/TimeSelect';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function GroupDetailPanel({ groupId, allUsers, onUpdateMember }) {
  const { detail, loading, error, addTemplate, updateTemplate, deleteTemplate } = useGroupDetail(groupId);

  const [tplForm, setTplForm] = useState({ name: '', startTime: '09:00', hours: '' });
  const [editTpl, setEditTpl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [memberError, setMemberError] = useState('');

  if (loading) return <p className="text-xs text-gray-500 p-2">Loading…</p>;
  if (error) return <p className="text-xs text-red-400 p-2">{error}</p>;
  if (!detail) return null;

  const memberIds = new Set(
    (allUsers || []).filter(u => u.groups && u.groups.some(g => g.id === groupId)).map(u => u.id)
  );

  async function handleTemplateAdd(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await addTemplate({ name: tplForm.name, startTime: tplForm.startTime, hours: Number(tplForm.hours) });
      setTplForm({ name: '', startTime: '', hours: '' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTemplateUpdate(e, tid) {
    e.preventDefault();
    await updateTemplate(tid, { name: editTpl.name, startTime: editTpl.startTime, hours: Number(editTpl.hours) });
    setEditTpl(null);
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-5 text-sm">
      {/* Members */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Members</h4>
        {memberError && <p className="text-xs text-red-400">{memberError}</p>}
        {(allUsers || []).filter(u => u.is_active).map(u => (
          <label key={u.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={memberIds.has(u.id)}
              onChange={async () => {
                setMemberError('');
                const r = await onUpdateMember(u, groupId, !memberIds.has(u.id));
                if (r && !r.ok) setMemberError('Failed to update member');
              }}
              className="accent-blue-500"
            />
            <span className="text-gray-300 text-xs">{u.name}</span>
            <span className="text-gray-500 text-xs">{u.role}</span>
          </label>
        ))}
        {(allUsers || []).filter(u => u.is_active).length === 0 && (
          <p className="text-xs text-gray-500">No active staff to assign.</p>
        )}
      </section>

      {/* Shift Templates */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Shift Templates</h4>
        {detail.templates.map(t => (
          editTpl?.id === t.id ? (
            <form key={t.id} onSubmit={e => handleTemplateUpdate(e, t.id)} className="flex gap-1">
              <input
                value={editTpl.name}
                onChange={e => setEditTpl(p => ({ ...p, name: e.target.value }))}
                className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100"
                placeholder="Name"
              />
              <TimeSelect
                value={editTpl.startTime}
                onChange={v => setEditTpl(p => ({ ...p, startTime: v }))}
                className="w-24"
              />
              <input
                type="number" min={0.5} max={24} step={0.5}
                value={editTpl.hours}
                onChange={e => setEditTpl(p => ({ ...p, hours: e.target.value }))}
                className="w-10 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-xs text-gray-100"
                placeholder="hrs"
              />
              <button type="submit" className="px-2 py-1 text-xs bg-blue-700 text-white rounded">Save</button>
              <button type="button" onClick={() => setEditTpl(null)} className="px-2 py-1 text-xs text-gray-400 border border-gray-600 rounded">✕</button>
            </form>
          ) : (
            <div key={t.id} className="flex items-center gap-2">
              <span className="flex-1 text-xs text-gray-300">{t.name} · {toDisplayTime(t.start_time)} · {t.hours}h</span>
              <button onClick={() => setEditTpl({ id: t.id, name: t.name, startTime: t.start_time, hours: t.hours })} className="text-xs text-gray-500 hover:text-gray-300">✏️</button>
              <button onClick={() => deleteTemplate(t.id)} className="text-xs text-red-500 hover:text-red-400">🗑</button>
            </div>
          )
        ))}
        <form onSubmit={handleTemplateAdd} className="flex gap-1">
          <input
            value={tplForm.name}
            onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))}
            className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100"
            placeholder="Template name"
            required
          />
          <TimeSelect
            value={tplForm.startTime}
            onChange={v => setTplForm(p => ({ ...p, startTime: v }))}
            className="w-24"
          />
          <input
            type="number" min={0.5} max={24} step={0.5}
            value={tplForm.hours}
            onChange={e => setTplForm(p => ({ ...p, hours: e.target.value }))}
            className="w-10 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-xs text-gray-100"
            placeholder="hrs"
            required
          />
          <button type="submit" disabled={saving} className="px-2 py-1 text-xs bg-green-700 text-white rounded disabled:opacity-50">Add</button>
        </form>
      </section>

      <p className="text-xs text-gray-500 italic">Coverage rules are managed in the Schedule Builder → Coverage tab.</p>
    </div>
  );
}

export default function GroupManagement() {
  const { user } = useAuth();
  const { groups, loading, error, createGroup, updateGroup, deleteGroup } = useGroups();
  const { users, updateUser, updateMembership } = useStaff();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', color: '#6366f1' });
  const [editGroupId, setEditGroupId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [saveError, setSaveError] = useState('');

  if (user?.role === 'staff') return <Navigate to="/" replace />;

  async function handleAddGroup(e) {
    e.preventDefault();
    const result = await createGroup(addForm);
    if (result.ok) {
      setAddOpen(false);
      setAddForm({ name: '', color: '#6366f1' });
      setSaveError('');
    } else {
      setSaveError(result.data?.error || 'Failed to create group');
    }
  }

  async function handleUpdateGroup(e, id) {
    e.preventDefault();
    const result = await updateGroup(id, editForm);
    if (result.ok) setEditGroupId(null);
  }

  async function handleDeleteGroup(id) {
    const result = await deleteGroup(id);
    if (!result.ok) {
      alert('Cannot delete group with assigned staff. Remove all members first.');
    } else if (expandedId === id) {
      setExpandedId(null);
    }
  }

  async function handleUpdateMember(targetUser, groupId, adding) {
    return await updateMembership(targetUser.id, groupId, adding);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="sticky top-[57px] z-10 bg-gray-950 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-100">Group Management</h2>
          <p className="text-xs text-gray-500">{groups.length} group{groups.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setAddOpen(s => !s); setSaveError(''); }}
          className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg"
        >
          Add Group
        </button>
      </div>

      {addOpen && (
        <form onSubmit={handleAddGroup} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Group name</label>
            <input
              value={addForm.name}
              onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100"
              placeholder="e.g. Servers"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Color</label>
            <input
              type="color"
              value={addForm.color}
              onChange={e => setAddForm(p => ({ ...p, color: e.target.value }))}
              className="h-9 w-12 bg-gray-900 border border-gray-600 rounded-lg cursor-pointer"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg">Save</button>
          <button type="button" onClick={() => { setAddOpen(false); setSaveError(''); }} className="px-3 py-1.5 text-sm text-gray-400 border border-gray-600 rounded-lg">Cancel</button>
        </form>
      )}
      {saveError && <p className="text-xs text-red-400">{saveError}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm p-4">Loading…</p>
      ) : error ? (
        <p className="text-red-400 text-sm p-4">{error}</p>
      ) : groups.length === 0 ? (
        <p className="text-gray-500 text-sm p-4">No groups yet.</p>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className="w-5 h-5 rounded-sm shrink-0" style={{ backgroundColor: g.color }} />
                {editGroupId === g.id ? (
                  <form onSubmit={e => handleUpdateGroup(e, g.id)} className="flex gap-2 flex-1 items-center">
                    <input
                      value={editForm.name}
                      onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                      className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100"
                      required
                    />
                    <input
                      type="color"
                      value={editForm.color}
                      onChange={e => setEditForm(p => ({ ...p, color: e.target.value }))}
                      className="h-7 w-10 bg-gray-900 border border-gray-600 rounded cursor-pointer"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">$/hr</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.hourly_rate}
                        onChange={e => setEditForm(p => ({ ...p, hourly_rate: e.target.value }))}
                        placeholder="—"
                        className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
                      />
                    </div>
                    <button type="submit" className="text-xs px-2 py-1 bg-blue-700 text-white rounded">Save</button>
                    <button type="button" onClick={() => setEditGroupId(null)} className="text-xs px-2 py-1 text-gray-400 border border-gray-600 rounded">✕</button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-100">{g.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditGroupId(g.id); setEditForm({ name: g.name, color: g.color, hourly_rate: g.hourly_rate ?? '' }); }}
                        className="p-1 text-gray-400 hover:text-gray-200"
                        title="Edit group"
                      >✏️</button>
                      <button
                        onClick={() => handleDeleteGroup(g.id)}
                        className="p-1 text-red-500 hover:text-red-400"
                        title="Delete group"
                      >🗑</button>
                      <button
                        onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                        className="p-1 text-gray-400 hover:text-gray-200"
                        title={expandedId === g.id ? 'Collapse' : 'Expand'}
                      >
                        {expandedId === g.id ? '▲' : '▼'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {expandedId === g.id && (
                <div className="border-t border-gray-700 p-4">
                  <GroupDetailPanel
                    groupId={g.id}
                    allUsers={users}
                    onUpdateMember={handleUpdateMember}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
