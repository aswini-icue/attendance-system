import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Search, UserCheck, UserX, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PageHeader, PersonCell, StatusBadge } from '../components/UI';
import Loader from '../components/Loader';
import { STATUSES, formatDate, toHHMM, todayInTz } from '../utils/format';

function shiftDate(str, n) {
  const d = new Date(`${str}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function AttendanceRegister() {
  const { settings } = useAuth();
  const today = todayInTz(settings.timezone);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState(new Set());
  const [meta, setMeta] = useState({ isWeeklyOff: false });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/register', { params: { date } });
      setRows(data.rows);
      setMeta({ isWeeklyOff: data.isWeeklyOff });
      const init = {};
      data.rows.forEach(({ employee, record }) => {
        init[employee._id] = {
          status: record?.status || '',
          checkIn: toHHMM(record?.checkIn, settings.timezone),
          checkOut: toHHMM(record?.checkOut, settings.timezone),
          remarks: record?.remarks || '',
          saved: !!record,
        };
      });
      setEdits(init);
      setDirty(new Set());
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [date, settings.timezone]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (id, patch) => {
    setEdits((prev) => {
      const next = { ...prev[id], ...patch };
      if (patch.status === 'Absent' || patch.status === 'Leave') {
        next.checkIn = '';
        next.checkOut = '';
      }
      return { ...prev, [id]: next };
    });
    setDirty((prev) => new Set(prev).add(id));
  };

  const markUnmarked = (status) => {
    let n = 0;
    rows.forEach(({ employee }) => {
      if (!edits[employee._id]?.status) {
        update(employee._id, { status, checkIn: status === 'Present' ? settings.shifts?.[0]?.start || '09:00' : '' });
        n += 1;
      }
    });
    toast(n ? `${n} employee(s) set to ${status} — remember to save` : 'Everyone already has a status');
  };

  const save = async () => {
    const records = [...dirty]
      .filter((id) => edits[id]?.status)
      .map((id) => ({ employee: id, ...edits[id] }));
    if (!records.length) return toast('No changes to save');
    setSaving(true);
    try {
      const { data } = await api.post('/attendance/bulk', { date, records });
      toast.success(data.message);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(({ employee: e }) =>
      [e.name, e.employeeId, e.department].some((v) => (v || '').toLowerCase().includes(s))
    );
  }, [rows, q]);

  const counts = useMemo(() => {
    const c = { Present: 0, Late: 0, 'Half-day': 0, Absent: 0, Leave: 0, none: 0 };
    Object.values(edits).forEach((e) => {
      if (e.status) c[e.status] += 1;
      else c.none += 1;
    });
    return c;
  }, [edits]);

  const isFuture = date > today;

  return (
    <>
      <PageHeader
        title="Daily Attendance Register"
        subtitle={formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            <div className="date-nav">
              <button className="icon-btn" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
                <ChevronLeft size={18} />
              </button>
              <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button
                className="icon-btn"
                onClick={() => setDate(shiftDate(date, 1))}
                disabled={date >= today}
                aria-label="Next day"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving || !dirty.size || isFuture}>
              <Save size={16} /> {saving ? 'Saving…' : `Save${dirty.size ? ` (${dirty.size})` : ''}`}
            </button>
          </>
        }
      />

      {meta.isWeeklyOff && <div className="alert alert-info">This date is a weekly off day.</div>}

      <div className="chips">
        {STATUSES.map((s) => (
          <span key={s} className="chip">
            <StatusBadge status={s} /> <strong>{counts[s]}</strong>
          </span>
        ))}
        <span className="chip">
          <StatusBadge status="" /> <strong>{counts.none}</strong>
        </span>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="input-icon grow">
            <Search size={16} />
            <input placeholder="Filter employees…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={() => markUnmarked('Present')} disabled={isFuture}>
            <UserCheck size={16} /> Unmarked → Present
          </button>
          <button className="btn btn-ghost" onClick={() => markUnmarked('Absent')} disabled={isFuture}>
            <UserX size={16} /> Unmarked → Absent
          </button>
        </div>

        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <EmptyState title="No active employees" text="Add employees from the Employees page." />
        ) : (
          <div className="table-wrap">
            <table className="table register">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ employee }) => {
                  const e = edits[employee._id] || {};
                  const noTimes = !e.status || e.status === 'Absent' || e.status === 'Leave';
                  return (
                    <tr key={employee._id} className={dirty.has(employee._id) ? 'row-dirty' : ''}>
                      <td>
                        <PersonCell
                          name={employee.name}
                          sub={`${employee.employeeId}${employee.department ? ` · ${employee.department}` : ''}`}
                        />
                      </td>
                      <td>
                        <div className="status-picker">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`pill pill-${s.toLowerCase().replace(/[^a-z]/g, '')} ${e.status === s ? 'active' : ''}`}
                              onClick={() => update(employee._id, { status: s })}
                              disabled={isFuture}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <input
                          type="time"
                          value={e.checkIn || ''}
                          disabled={noTimes || isFuture}
                          onChange={(ev) => update(employee._id, { checkIn: ev.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={e.checkOut || ''}
                          disabled={noTimes || isFuture}
                          onChange={(ev) => update(employee._id, { checkOut: ev.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="remarks"
                          value={e.remarks || ''}
                          placeholder="Optional"
                          disabled={isFuture}
                          onChange={(ev) => update(employee._id, { remarks: ev.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
