import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from '../UI';
import Loader from '../Loader';
import { addDays, formatDate, minutesToHM, mondayOf, toHHMM, todayInTz, weekday } from '../../utils/format';

const signed = (m) => `${m >= 0 ? '+' : '−'}${minutesToHM(Math.abs(m)) === '—' ? '0h 00m' : minutesToHM(Math.abs(m))}`;

export default function TimesheetTab() {
  const { settings } = useAuth();
  const tz = settings.timezone;
  const today = todayInTz(tz);
  const [from, setFrom] = useState(mondayOf(today));
  const [data, setData] = useState(null);
  const to = addDays(from, 6);
  const shifts = settings.shifts || [];
  const expectedMin = (settings.expectedDailyHours || 8) * 60;
  const weeklyOff = settings.weeklyOffDays || [0];

  useEffect(() => {
    setData(null);
    api
      .get('/attendance/me', { params: { from, to } })
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(errMsg(e)));
  }, [from, to]);

  if (!data) return <Loader />;

  const recs = new Map(data.records.map((r) => [r.date, r]));
  const hols = new Map(data.holidays.map((h) => [h.date, h.name]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  let tot = 0;
  let exp = 0;
  let ot = 0;

  const cell = (r, sh) => {
    const s = r?.sessions?.find((x) => x.shift === sh.key);
    if (s) {
      return (
        <>
          {toHHMM(s.in, tz)} – {s.out ? toHHMM(s.out, tz) : <span className="live">now</span>}
          {s.manual && <span className="ot-tag"> OT</span>}
        </>
      );
    }
    if (r?.source === 'admin' && sh.key === shifts[0]?.key && r.checkIn) return `${toHHMM(r.checkIn, tz)} – ${toHHMM(r.checkOut, tz) || '—'}`;
    return <span className="muted">—</span>;
  };

  const rows = days.map((d) => {
    const r = recs.get(d);
    const off = hols.has(d) || weeklyOff.includes(new Date(`${d}T00:00:00Z`).getUTCDay());
    const e = off || r?.status === 'Leave' ? 0 : expectedMin;
    const worked = r?.workMinutes || 0;
    const past = d <= today;
    if (past) {
      tot += worked;
      exp += e;
      ot += r?.otMinutes || 0;
    }
    let status;
    if (hols.has(d)) status = <span className="badge badge-holiday">Holiday</span>;
    else if (r) status = <StatusBadge status={r.status} />;
    else if (off) status = <span className="badge badge-muted">Weekly off</span>;
    else if (!past) status = <span className="muted small">Upcoming</span>;
    else status = <StatusBadge status="" />;
    const diff = worked - e;
    return (
      <tr key={d} className={d === today ? 'row-today' : ''}>
        <td className="nowrap">
          <strong>{weekday(d)}</strong> <span className="muted small">{formatDate(d, { day: '2-digit', month: 'short' })}</span>
        </td>
        {shifts.map((sh) => (
          <td key={sh.key}>{cell(r, sh)}</td>
        ))}
        <td>{status}</td>
        <td className="num">{minutesToHM(worked)}</td>
        <td className="num">{r?.otMinutes ? minutesToHM(r.otMinutes) : '—'}</td>
        <td className="num">{e ? `${e / 60}h` : '—'}</td>
        <td className={`num ${!past || (!e && !worked) ? '' : diff >= 0 ? 'tone-text-green' : 'tone-text-red'}`}>
          {!past || (!e && !worked) ? '—' : signed(diff)}
        </td>
      </tr>
    );
  });

  return (
    <div className="card flush">
      <div className="card-head padded">
        <h3>Weekly timesheet</h3>
        <div className="date-nav">
          <button className="icon-btn" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week">
            <ChevronLeft size={18} />
          </button>
          <span className="week-label">
            {formatDate(from, { day: '2-digit', month: 'short' })} – {formatDate(to, { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <button className="icon-btn" onClick={() => setFrom(addDays(from, 7))} disabled={to >= today} aria-label="Next week">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table ws-table">
          <thead>
            <tr>
              <th>Day</th>
              {shifts.map((sh) => (
                <th key={sh.key}>
                  {sh.label} {sh.start}–{sh.end}
                </th>
              ))}
              <th>Status</th>
              <th className="num">Worked</th>
              <th className="num">OT</th>
              <th className="num">Expected</th>
              <th className="num">Variance</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
          <tfoot>
            <tr>
              <td colSpan={shifts.length + 2}>
                <strong>Week total</strong>
              </td>
              <td className="num">
                <strong>{minutesToHM(tot)}</strong>
              </td>
              <td className="num">
                <strong>{minutesToHM(ot)}</strong>
              </td>
              <td className="num">
                <strong>{minutesToHM(exp)}</strong>
              </td>
              <td className={`num ${tot - exp >= 0 ? 'tone-text-green' : 'tone-text-red'}`}>
                <strong>{signed(tot - exp)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
