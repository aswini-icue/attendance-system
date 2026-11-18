import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PageHeader, PersonCell, StatusBadge } from '../components/UI';
import Loader from '../components/Loader';
import { addDays, formatDate, minutesToHM, toHHMM, todayInTz } from '../utils/format';

export default function TeamTimesheets() {
  const { settings } = useAuth();
  const tz = settings.timezone;
  const today = todayInTz(tz);
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api
      .get('/attendance/team', { params: { date } })
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(errMsg(e)));
  }, [date]);

  const cell = (r, sh, first) => {
    const s = r?.sessions?.find((x) => x.shift === sh.key);
    if (s) {
      return (
        <>
          {toHHMM(s.in, tz)} – {s.out ? toHHMM(s.out, tz) : <span className="live">now</span>}
          {s.manual ? <span className="ot-tag"> OT</span> : s.auto ? <span className="muted small"> auto</span> : null}
        </>
      );
    }
    if (r?.source === 'admin' && first && r.checkIn) return `${toHHMM(r.checkIn, tz)} – ${toHHMM(r.checkOut, tz) || '—'}`;
    return <span className="muted">—</span>;
  };

  let tot = 0;
  let ot = 0;
  const live = (r) => {
    if (!r?.sessions?.length || date !== today) return r?.workMinutes || 0;
    return Math.round(r.sessions.reduce((a, s) => a + ((s.out ? new Date(s.out) : new Date()) - new Date(s.in)) / 60000, 0));
  };

  return (
    <>
      <PageHeader
        title="Team Timesheets"
        subtitle={`${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${data?.holiday ? ` · Holiday: ${data.holiday}` : ''}`}
        actions={
          <div className="date-nav">
            <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
              <ChevronLeft size={18} />
            </button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
              <ChevronRight size={18} />
            </button>
          </div>
        }
      />
      <div className="card flush">
        {!data ? (
          <Loader />
        ) : data.rows.length === 0 ? (
          <EmptyState title="No active employees" />
        ) : (
          <div className="table-wrap">
            <table className="table ws-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  {data.shifts.map((sh) => (
                    <th key={sh.key}>
                      {sh.label} {sh.start}–{sh.end}
                    </th>
                  ))}
                  <th className="num">Worked</th>
                  <th className="num">OT</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(({ employee: e, record: r }) => {
                  const w = live(r);
                  tot += w;
                  ot += r?.otMinutes || 0;
                  const working = r?.sessions?.some((s) => s.shift !== 'ot' && !s.out);
                  return (
                    <tr key={e._id}>
                      <td>
                        <PersonCell name={e.name} sub={`${e.employeeId} · ${e.department || '—'}`} />
                      </td>
                      {data.shifts.map((sh, i) => (
                        <td key={sh.key}>{cell(r, sh, i === 0)}</td>
                      ))}
                      <td className="num">{minutesToHM(w)}</td>
                      <td className="num">{r?.otMinutes ? minutesToHM(r.otMinutes) : '—'}</td>
                      <td className="nowrap">
                        {working && <span className="badge badge-working">Working</span>}{' '}
                        {r?.sessions?.some((s) => s.shift === 'ot' && !s.out) && <span className="ot-tag">OT running</span>} <StatusBadge status={r?.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={data.shifts.length + 1}>
                    <strong>Total</strong>
                  </td>
                  <td className="num">
                    <strong>{minutesToHM(tot)}</strong>
                  </td>
                  <td className="num">
                    <strong>{minutesToHM(ot)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
