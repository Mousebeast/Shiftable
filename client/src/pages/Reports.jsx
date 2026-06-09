import { useState } from 'react';
import { getMondayOf } from '../hooks/useSchedule';

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultRange() {
  const monday = getMondayOf(new Date());
  const sunday = new Date(monday + 'T00:00:00');
  sunday.setDate(sunday.getDate() + 6);
  return { from: monday, to: toLocalDateString(sunday) };
}

export default function Reports() {
  const { from: defaultFrom, to: defaultTo } = defaultRange();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRun() {
    if (!from || !to) { setError('Both dates are required'); return; }
    if (from > to) { setError('"From" must be on or before "To"'); return; }
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/reports/hours?from=${from}&to=${to}`, { credentials: 'include' });
      const d = await r.json();
      if (r.ok) setRows(d.rows);
      else setError(d.error || 'Failed to load report');
    } catch {
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    if (!rows) return;
    const header = 'Name,Total Hours,Shifts';
    const lines = rows.map(r => `"${r.name.replace(/"/g, '""')}",${r.total_hours},${r.shift_count}`);
    const csv = [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hours-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalHours = rows ? rows.reduce((sum, r) => sum + r.total_hours, 0) : 0;
  const totalShifts = rows ? rows.reduce((sum, r) => sum + r.shift_count, 0) : 0;
  const staffWithHours = rows ? rows.filter(r => r.total_hours > 0).length : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <h1 className="text-lg font-semibold text-gray-100">Hours Report</h1>

      {/* Date range inputs */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">From</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">To</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={handleRun}
          disabled={loading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Loading…' : 'Run'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {rows && (
        <>
          {/* Summary strip */}
          <div className="flex gap-4 flex-wrap">
            <div className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl">
              <p className="text-xs text-gray-500">Total hours</p>
              <p className="text-lg font-semibold text-gray-100">{totalHours.toFixed(1)}</p>
            </div>
            <div className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl">
              <p className="text-xs text-gray-500">Total shifts</p>
              <p className="text-lg font-semibold text-gray-100">{totalShifts}</p>
            </div>
            <div className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl">
              <p className="text-xs text-gray-500">Staff with hours</p>
              <p className="text-lg font-semibold text-gray-100">{staffWithHours}</p>
            </div>
          </div>

          {/* Results table */}
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400">No published shifts found in this range.</p>
          ) : (
            <div className="border border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-700">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400">Name</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400">Hours</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-400">Shifts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.total_hours > 0).map((r, i) => (
                    <tr key={r.user_id} className={`border-b border-gray-700/50 ${i % 2 === 0 ? 'bg-gray-900/30' : ''}`}>
                      <td className="px-4 py-2.5 text-gray-100">{r.name}</td>
                      <td className="px-4 py-2.5 text-right text-gray-100">{r.total_hours.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{r.shift_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CSV export */}
          {rows.some(r => r.total_hours > 0) && (
            <button
              onClick={handleExportCsv}
              className="px-4 py-2 text-sm text-gray-400 border border-gray-600 hover:border-gray-400 hover:text-gray-200 rounded-lg transition-colors"
            >
              Export CSV
            </button>
          )}
        </>
      )}
    </div>
  );
}
