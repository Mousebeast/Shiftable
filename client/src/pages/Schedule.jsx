import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSchedule, getMondayOf } from '../hooks/useSchedule';

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function MyWeek({ weekStart, userId }) {
  const { shifts, loading } = useSchedule(weekStart);
  const myShifts = shifts.filter((s) => s.user_id === userId);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (loading) return <p className="p-4 text-gray-400">Loading…</p>;

  return (
    <div className="divide-y divide-gray-700">
      {days.map((date) => {
        const dayShifts = myShifts.filter((s) => s.date === date);
        return (
          <div key={date} className="px-4 py-3">
            <p className="text-xs font-medium text-gray-500 mb-1">{formatDate(date)}</p>
            {dayShifts.length === 0 ? (
              <p className="text-sm text-gray-400">Off</p>
            ) : (
              dayShifts.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.group_color }}
                  />
                  <span className="text-sm font-medium text-gray-100">{s.group_name}</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {formatTime(s.start_time)}
                  </span>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function FullGrid({ weekStart }) {
  const { shifts, loading, events } = useSchedule(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Build sorted unique user list from shifts — sort by group priority then name
  const usersMap = {};
  shifts.forEach((s) => {
    if (!usersMap[s.user_id] || s.group_priority < usersMap[s.user_id].priority) {
      usersMap[s.user_id] = { name: s.user_name, priority: s.group_priority ?? Infinity };
    }
  });
  const users = Object.entries(usersMap).sort((a, b) => {
    const pd = a[1].priority - b[1].priority;
    return pd !== 0 ? pd : a[1].name.localeCompare(b[1].name);
  });

  if (loading) return <p className="p-4 text-gray-400">Loading…</p>;
  if (shifts.length === 0) {
    return <p className="p-4 text-gray-400 text-sm">No published schedule for this week.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-950">
              <th className="sticky left-0 bg-gray-950 border border-gray-700 px-2 py-2 text-left font-medium text-gray-300 min-w-[90px] z-10">
                Name
              </th>
              {days.map((d) => (
                <th key={d} className="border border-gray-700 px-2 py-2 font-medium text-gray-300 min-w-[80px] whitespace-nowrap">
                  {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky left-0 bg-gray-900 border border-gray-700 px-2 py-2 font-bold text-gray-400 text-[10px] tracking-widest z-10 whitespace-nowrap">
                EVENTS
              </td>
              {days.map((date) => {
                const dayTitles = events[date] || [];
                return (
                  <td key={date} className="border border-gray-700 px-1 py-1 align-top">
                    <div className="flex flex-wrap gap-0.5 min-h-[18px]">
                      {dayTitles.map(t => (
                        <span key={t.id} className="inline-flex items-center bg-purple-900/50 border border-purple-700/50 text-purple-200 text-[9px] px-1 py-0.5 rounded">
                          {t.title}
                        </span>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
            {users.map(([userId, { name: userName }]) => (
              <tr key={userId} className="hover:bg-gray-700">
                <td className="sticky left-0 bg-gray-800 border border-gray-700 px-2 py-2 font-medium text-gray-100 z-10 whitespace-nowrap">
                  {userName}
                </td>
                {days.map((date) => {
                  const cellShifts = shifts.filter(
                    (s) => s.user_id === Number(userId) && s.date === date
                  );
                  return (
                    <td key={date} className="border border-gray-700 px-1 py-1 align-top">
                      {cellShifts.map((s) => (
                        <div
                          key={s.id}
                          className="rounded px-1 py-0.5 mb-0.5 text-white text-[10px] leading-tight"
                          style={{ backgroundColor: s.group_color }}
                        >
                          {s.group_name}<br />{formatTime(s.start_time)}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500 text-center py-2 sm:hidden">
        Rotate your device for a better view
      </p>
    </div>
  );
}

function DayView({ weekStart }) {
  const { shifts, loading, events } = useSchedule(weekStart);
  const _t = new Date();
  const today = `${_t.getFullYear()}-${String(_t.getMonth()+1).padStart(2,'0')}-${String(_t.getDate()).padStart(2,'0')}`;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [selectedDay, setSelectedDay] = useState(() =>
    days.includes(today) ? today : weekStart
  );

  // Keep selectedDay in range when weekStart changes
  const dayInRange = days.includes(selectedDay) ? selectedDay : weekStart;

  const dayShifts = shifts.filter((s) => s.date === dayInRange);

  // Group by group_name, tracking priority for sort
  const byGroup = {};
  dayShifts.forEach((s) => {
    if (!byGroup[s.group_name]) byGroup[s.group_name] = { color: s.group_color, priority: s.group_priority ?? Infinity, shifts: [] };
    byGroup[s.group_name].shifts.push(s);
  });

  if (loading) return <p className="p-4 text-gray-400">Loading…</p>;

  return (
    <div>
      {/* Day picker strip */}
      <div className="flex overflow-x-auto gap-1 px-4 py-2 border-b border-gray-700 bg-gray-800">
        {days.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDay(d)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              d === dayInRange
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
            {(events[d] || []).length > 0 && (
              <span className={`block w-1.5 h-1.5 rounded-full mx-auto mt-0.5 ${d === dayInRange ? 'bg-purple-300' : 'bg-purple-500'}`} />
            )}
          </button>
        ))}
      </div>

      {(events[dayInRange] || []).length > 0 && (
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-purple-400 text-xs">✦</span>
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Events</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(events[dayInRange] || []).map(t => (
              <span key={t.id} className="bg-purple-900/50 border border-purple-700/50 text-purple-200 text-xs px-2.5 py-1 rounded-full">
                {t.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {Object.keys(byGroup).length === 0 ? (
        <p className="p-4 text-gray-400 text-sm">No shifts scheduled for this day.</p>
      ) : (
        <div className="divide-y divide-gray-700">
          {Object.entries(byGroup)
            .sort((a, b) => {
              const pd = a[1].priority - b[1].priority;
              return pd !== 0 ? pd : a[0].localeCompare(b[0]);
            })
            .map(([groupName, { color, shifts: gs }]) => (
              <div key={groupName} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                    {groupName}
                  </span>
                </div>
                <div className="space-y-1">
                  {gs
                    .sort((a, b) => a.start_time.localeCompare(b.start_time))
                    .map((s) => (
                      <div key={s.id} className="flex justify-between text-sm">
                        <span className="text-gray-100">{s.user_name}</span>
                        <span className="text-gray-500 text-xs">
                          {formatTime(s.start_time)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const TABS = ['My Week', 'Full Grid', 'Day View'];

export default function Schedule() {
  const { user } = useAuth();
  const [tab, setTab] = useState('My Week');
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));

  function prevWeek() { setWeekStart(w => addDays(w, -7)); }
  function nextWeek() { setWeekStart(w => addDays(w, 7)); }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center px-4 py-3 border-b border-gray-700 bg-gray-800 sticky top-[57px] z-10">
        <h1 className="font-semibold text-gray-100">Schedule</h1>
      </div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-700 bg-gray-800 sticky top-[101px] z-10">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <button onClick={prevWeek} className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200">‹</button>
        <span className={`text-sm font-medium ${weekStart === getMondayOf(new Date()) ? 'text-blue-400' : 'text-gray-100'}`}>
          Week of {formatDate(weekStart)}
        </span>
        <button onClick={nextWeek} className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200">›</button>
      </div>

      {tab === 'My Week' && <MyWeek weekStart={weekStart} userId={user?.id} />}
      {tab === 'Full Grid' && <FullGrid weekStart={weekStart} />}
      {tab === 'Day View' && <DayView weekStart={weekStart} />}
    </div>
  );
}
