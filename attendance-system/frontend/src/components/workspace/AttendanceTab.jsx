import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Hourglass, LogIn, LogOut, Timer } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, StatusBadge } from '../UI';
import Loader from '../Loader';
import { formatDate, hms, hoursDec, minutesToHM, toHHMM } from '../../utils/format';
import OutTimeModal from './OutTimeModal';
import OtMenuModal from './OtMenuModal';

const ms = (d) => new Date(d).getTime();

export default function AttendanceTab({ onChanged }) {
  const { settings } = useAuth();
  const tz = settings.timezone;
  const [state, setState] = useState(null);
  const [history, setHistory] = useState(null);
  const [offset, setOffset] = useState(0); // server clock - browser clock
  const [tick, setTick] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [otOpen, setOtOpen] = useState(false); // record out time
  const [otMenu, setOtMenu] = useState(false); // OT menu
  const reloadedFor = useRef(null);

  const applyState = (data) => {
    setOffset(ms(data.serverTime) - Date.now());
    setState(data);
  };

  const load = useCallback(async () => {
    const [t, h] = await Promise.all([api.get('/attendance/today'), api.get('/attendance/me')]);
    applyState(t.data);
    setHistory(h.data);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(errMsg(e)));
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const now = tick + offset;
  const shifts = state?.shifts || [];
  const shiftOf = (key) => shifts.find((s) => s.key === key);
  const phase = state?.phase || {};
  const rec = state?.record;
  const sessions = rec?.sessions || [];
  const curShift = phase.shift ? shiftOf(phase.shift) : null;

  // The moment the screen should change (shift end / clock-in opening)
  const target = curShift ? (phase.phase === 'open' || phase.phase === 'clockable' ? ms(curShift.endAt) : ms(curShift.opensAt)) : null;

  // When a boundary passes (e.g. auto clock-out at shift end), refresh from the server once
  useEffect(() => {
    if (target && now >= target + 1500 && reloadedFor.current !== target) {
      reloadedFor.current = target;
      load()
        .then(() => {
          onChanged?.();
          if (phase.phase === 'open') toast(`Shift ended at ${curShift.end}: you were clocked out automatically`);
        })
        .catch(() => {});
    }
  }, [now, target, load, onChanged, phase.phase, curShift]);

  const workedSec = useMemo(
    () => sessions.reduce((a, s) => a + Math.max(0, ((s.out ? ms(s.out) : now) - ms(s.in)) / 1000), 0),
    [sessions, now]
  );

  const act = async (path) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/attendance/${path}`);
      applyState(data);
      toast.success(data.message);
      const h = await api.get('/attendance/me');
      setHistory(h.data);
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const onOtSaved = async (data) => {
    applyState(data);
    setOtOpen(false);
    setOtMenu(false);
    toast.success(data.message);
    const h = await api.get('/attendance/me');
    setHistory(h.data);
    onChanged?.();
  };

  const rows = useMemo(() => {
    if (!history) return [];
    const map = new Map();
    history.holidays.forEach((h) => map.set(h.date, { date: h.date, holiday: h.name }));
    history.records.forEach((r) => map.set(r.date, { ...map.get(r.date), date: r.date, record: r }));
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [history]);

  if (!state) return <Loader />;

  const regular = sessions.filter((s) => s.shift !== 'ot');
  const lastSession = [...regular].sort((a, b) => ms(b.in) - ms(a.in))[0];
  const otRun = phase.ot;
  const OtButton = () =>
    otRun ? (
      <button className="btn btn-ot running" onClick={() => act('ot/stop')} disabled={busy}>
        <AlarmClock size={16} /> Stop OT <span className="mono">{hms((now - ms(otRun.in)) / 1000)}</span>
      </button>
    ) : (
      <button className="btn btn-ot" onClick={() => setOtMenu(true)} disabled={busy}>
        <AlarmClock size={16} /> OT
      </button>
    );
  const otLine = otRun && (
    <div className="shift-line ot-line">
      <AlarmClock size={15} /> Overtime running since {toHHMM(otRun.in, tz)}
    </div>
  );
  const workedLine = (
    <div className="shift-sub muted">
      Worked today: <span className="mono">{hms(workedSec)}</span>
      {rec?.otMinutes > 0 && (
        <>
          {' '}
          · <span className="ot-tag">+{minutesToHM(rec.otMinutes)} OT</span>
        </>
      )}
    </div>
  );

  let title = '';
  let body = null;
  let actions = null;
  switch (phase.phase) {
    case 'open': {
      const open = regular.find((s) => !s.out);
      title = `On the ${curShift.label.toLowerCase()} shift`;
      body = (
        <>
          <div className="shift-line">
            Clocked in at {toHHMM(open.in, tz)} · auto clock out at {curShift.end}
          </div>
          <div className="shift-line">
            <Timer size={15} className="tone-text-green" /> Time left in shift{' '}
            <span className="mono strong">{hms((target - now) / 1000)}</span>
          </div>
          {workedLine}
        </>
      );
      actions = (
        <>
          <OtButton />
          <button className="btn btn-outline" onClick={() => act('clock-out')} disabled={busy}>
            <LogOut size={16} /> Clock Out
          </button>
        </>
      );
      break;
    }
    case 'clockable': {
      const late = now > ms(curShift.startAt) + state.lateGraceMinutes * 60000;
      title = `${curShift.label} shift is open`;
      body = (
        <>
          <div className="shift-line">
            Shift {curShift.start}–{curShift.end}
            {late && <span className="tone-text-red"> · you will be marked late</span>}
          </div>
          <div className="shift-line">
            <Timer size={15} className="tone-text-green" /> Time left in shift{' '}
            <span className="mono strong">{hms((target - now) / 1000)}</span>
          </div>
          {workedLine}
        </>
      );
      actions = (
        <>
          <OtButton />
          <button className="btn btn-primary" onClick={() => act('clock-in')} disabled={busy}>
            <LogIn size={16} /> Clock In
          </button>
        </>
      );
      break;
    }
    case 'before':
    case 'break':
      title = phase.phase === 'break' ? 'On break' : `${state.weeklyOff ? 'Weekly off · ' : ''}Shift starts at ${curShift.start}`;
      body = (
        <>
          <div className="shift-line">
            {curShift.label} shift {curShift.start}–{curShift.end} · clock in opens at {toHHMM(curShift.opensAt, tz)}
          </div>
          <div className="shift-line">
            <Hourglass size={15} /> Clock in opens in <span className="mono strong">{hms((target - now) / 1000)}</span>
          </div>
          {workedLine}
        </>
      );
      actions = <OtButton />;
      break;
    case 'done':
      title = lastSession ? 'Day complete' : state.weeklyOff ? 'Weekly off' : 'No shifts worked today';
      body = (
        <>
          <div className="shift-line">
            All shifts for today have ended. Working extra? Press <strong>&nbsp;OT&nbsp;</strong> to start overtime or enter your actual out time.
          </div>
          {workedLine}
        </>
      );
      actions = <OtButton />;
      break;
    case 'holiday':
      title = `Holiday · ${phase.note}`;
      body = (
        <>
          <div className="shift-line">Enjoy your day off! Working today? Press OT to log overtime.</div>
          {workedLine}
        </>
      );
      actions = <OtButton />;
      break;
    case 'leave':
      title = 'On leave today';
      body = (
        <>
          <div className="shift-line">Your approved leave covers today.</div>
          {workedLine}
        </>
      );
      actions = <OtButton />;
      break;
    case 'admin':
      title = `Marked ${rec.status} by HR`;
      body = (
        <div className="shift-line">
          {rec.checkIn ? `In ${toHHMM(rec.checkIn, tz)} · Out ${toHHMM(rec.checkOut, tz) || '—'}` : 'Your attendance for today was recorded by HR.'}
        </div>
      );
      break;
    default:
  }

  const chip = (sh) => {
    const s = sessions.find((x) => x.shift === sh.key);
    let text;
    let cls;
    if (s && !s.out) [text, cls] = [`${toHHMM(s.in, tz)} – now`, 'chip-live'];
    else if (s) [text, cls] = [`${toHHMM(s.in, tz)} – ${toHHMM(s.out, tz)}${s.manual ? ' (OT entry)' : ''}`, 'chip-done'];
    else if (['holiday', 'leave', 'admin'].includes(phase.phase)) [text, cls] = ['—', 'chip-idle'];
    else if (now >= ms(sh.endAt)) [text, cls] = ['missed', 'chip-missed'];
    else [text, cls] = ['not started', 'chip-idle'];
    return (
      <span key={sh.key} className={`s-chip ${cls}`}>
        {sh.label} {sh.start}–{sh.end} · {text}
      </span>
    );
  };

  return (
    <>
      <div className="card shift-card">
        <div className="shift-top">
          <div>
            <h3 className="shift-title">{title}</h3>
            {body}
            {otLine}
          </div>
          <div className="shift-actions">{actions}</div>
        </div>
        <div className="shift-bottom">
          <div className="muted small">
            {formatDate(state.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="s-chips">
            <span className="s-chip chip-expected">Expected today: {state.expectedHours} h</span>
            {shifts.map(chip)}
            {sessions
              .filter((s) => s.shift === 'ot')
              .map((s) => (
                <span key={s.in} className={`s-chip ${s.out ? 'chip-ot' : 'chip-live'}`}>
                  Overtime · {toHHMM(s.in, tz)} – {s.out ? toHHMM(s.out, tz) : 'now'}
                </span>
              ))}
            {rec?.status && <span className="s-chip chip-idle">Status: {rec.status === 'Half-day' ? 'Half Day' : rec.status}</span>}
          </div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-head padded">
          <h3>This month</h3>
        </div>
        {!history ? (
          <Loader />
        ) : rows.length === 0 ? (
          <EmptyState title="No attendance yet this month" />
        ) : (
          <div className="table-wrap">
            <table className="table ws-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>In</th>
                  <th>Out</th>
                  <th className="num">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ date, holiday, record: r }) => {
                  if (holiday && !r) {
                    return (
                      <tr key={date}>
                        <td>{date}</td>
                        <td>
                          <span className="badge badge-holiday">Holiday</span>
                          <div className="cell-note">{holiday}</div>
                        </td>
                        <td>—</td>
                        <td>—</td>
                        <td className="num">0</td>
                      </tr>
                    );
                  }
                  const manual = r.sessions?.some((s) => s.manual);
                  const note =
                    r.autoHalf && r.status === 'Half-day'
                      ? 'Set automatically'
                      : r.source === 'admin'
                        ? 'Marked by HR'
                        : manual
                          ? 'Out time entered'
                          : '';
                  return (
                    <tr key={date}>
                      <td>{date}</td>
                      <td>
                        <StatusBadge status={r.status} />
                        {note && <div className="cell-note">{note}</div>}
                      </td>
                      <td>{toHHMM(r.checkIn, tz) || '—'}</td>
                      <td>{toHHMM(r.checkOut, tz) || '—'}</td>
                      <td className="num">
                        {hoursDec(r.workMinutes)}
                        {r.otMinutes > 0 && <span className="ot-tag"> +{hoursDec(r.otMinutes)} OT</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {otMenu && (
        <OtMenuModal
          state={state}
          hasShift={!!lastSession}
          onClose={() => setOtMenu(false)}
          onStarted={onOtSaved}
          onRecordOutTime={() => {
            setOtMenu(false);
            setOtOpen(true);
          }}
        />
      )}
      {otOpen && lastSession && (
        <OutTimeModal
          state={state}
          session={regular.find((s) => !s.out) || lastSession}
          nowMs={now}
          onClose={() => setOtOpen(false)}
          onSaved={onOtSaved}
        />
      )}
    </>
  );
}
