import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { AlarmClock, CalendarCheck, CheckCircle2, Delete, LogIn, LogOut, Search, Tablet } from 'lucide-react';
import { errMsg } from '../api/client';
import { Avatar, EmptyState, Modal } from '../components/UI';
import { formatDate, toHHMM, todayInTz } from '../utils/format';

// The kiosk uses its own device token (not a user session), stored on this device only.
const KEY = 'kioskToken';
const kiosk = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
kiosk.interceptors.request.use((cfg) => {
  const t = localStorage.getItem(KEY);
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const TZ = import.meta.env.VITE_TIMEZONE || 'Asia/Kolkata';

function Activate({ onDone }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await kiosk.post('/kiosk/activate', form);
      localStorage.setItem(KEY, data.token);
      toast.success(`Kiosk activated by ${data.activatedBy}`);
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="kiosk-activate">
      <form className="card" onSubmit={submit}>
        <div className="ot-choice-icon" style={{ marginBottom: 12 }}>
          <Tablet size={20} />
        </div>
        <h2>Activate this device as an Attendance Kiosk</h2>
        <p className="muted small">
          An admin signs in once. After that, employees register their attendance here with their own PIN. No one is logged in on this
          device.
        </p>
        <label className="field">
          <span>Admin email</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label className="field">
          <span>Admin password</span>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Activating…' : 'Activate kiosk'}
        </button>
      </form>
    </div>
  );
}

function PinPad({ person, onClose, onVerified }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (value) => {
      setBusy(true);
      setError('');
      try {
        const { data } = await kiosk.post('/kiosk/state', { userId: person._id, pin: value });
        onVerified(value, data);
      } catch (e) {
        setError(errMsg(e));
        setPin('');
      } finally {
        setBusy(false);
      }
    },
    [person._id, onVerified]
  );

  const press = (k) => {
    if (busy) return;
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Modal open title={`Hi ${person.name.split(' ')[0]}, enter your PIN`} onClose={onClose} width={360}>
      <div className="k-dots">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="tone-text-red small center" style={{ minHeight: 18 }}>
        {error}
      </div>
      <div className="k-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'].map((k) => (
          <button key={k} type="button" onClick={() => press(k)} className={k === 'del' ? 'k-del' : ''} disabled={busy}>
            {k === 'del' ? <Delete size={18} /> : k}
          </button>
        ))}
        <button type="button" className="k-ok" onClick={() => pin.length === 4 && submit(pin)} disabled={busy || pin.length < 4}>
          OK
        </button>
      </div>
    </Modal>
  );
}

function Actions({ person, pin, state, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const ph = state.phase;
  const tz = TZ;
  const shift = ph.shift ? state.shifts.find((s) => s.key === ph.shift) : null;
  const open = state.record?.sessions?.find((s) => s.shift !== 'ot' && !s.out);

  const run = async (op) => {
    setBusy(true);
    try {
      const { data } = await kiosk.post('/kiosk/action', { userId: person._id, pin, op });
      onDone(data.message);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const info =
    ph.phase === 'open' && open
      ? `On the ${shift.label.toLowerCase()} shift since ${toHHMM(open.in, tz)} · auto clock out at ${shift.end}`
      : ph.phase === 'clockable'
        ? `${shift.label} shift ${shift.start}–${shift.end} is open`
        : ph.phase === 'holiday'
          ? `Holiday · ${ph.note}`
          : ph.phase === 'leave'
            ? 'On approved leave today'
            : shift
              ? `Next: ${shift.label} shift, clock in opens at ${toHHMM(shift.opensAt, tz)}`
              : 'All shifts for today have ended';

  return (
    <Modal
      open
      title={person.name}
      onClose={onClose}
      width={460}
      footer={
        <button className="btn btn-ghost" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="k-who">
        <Avatar name={person.name} size={46} brand />
        <div>
          <div className="muted small">
            {person.employeeId} · {person.designation}
          </div>
          <div className="small">{info}</div>
        </div>
      </div>
      <div className="k-acts" style={{ marginTop: 16 }}>
        {ph.phase === 'open' ? (
          <button className="k-act k-red" onClick={() => run('clock-out')} disabled={busy}>
            <LogOut size={26} />
            <span>Clock Out</span>
          </button>
        ) : (
          <button className="k-act k-green" onClick={() => run('clock-in')} disabled={busy || ph.phase !== 'clockable'}>
            <LogIn size={26} />
            <span>Clock In</span>
            {ph.phase !== 'clockable' && <small>Not open now</small>}
          </button>
        )}
        {ph.ot ? (
          <button className="k-act k-purple" onClick={() => run('ot-stop')} disabled={busy}>
            <AlarmClock size={26} />
            <span>Stop OT</span>
            <small>since {toHHMM(ph.ot.in, tz)}</small>
          </button>
        ) : (
          <button className="k-act k-purple" onClick={() => run('ot-start')} disabled={busy || !!state.otBlocked}>
            <AlarmClock size={26} />
            <span>Start OT</span>
            {state.otBlocked && <small>{state.otBlocked}</small>}
          </button>
        )}
      </div>
    </Modal>
  );
}

export default function Kiosk() {
  const navigate = useNavigate();
  const [active, setActive] = useState(!!localStorage.getItem(KEY));
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState('');
  const [clock, setClock] = useState(new Date());
  const [picked, setPicked] = useState(null); // person
  const [verified, setVerified] = useState(null); // { pin, state }
  const [done, setDone] = useState(null); // { name, message }

  const load = useCallback(() => {
    kiosk
      .get('/kiosk/people')
      .then(({ data }) => setPeople(data))
      .catch((e) => {
        if (e.response?.status === 401) {
          localStorage.removeItem(KEY);
          setActive(false);
        }
        toast.error(errMsg(e));
      });
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [active, load]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!done) return undefined;
    const id = setTimeout(() => setDone(null), 3000);
    return () => clearTimeout(id);
  }, [done]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (people || []).filter((p) => !s || [p.name, p.employeeId, p.department].some((v) => (v || '').toLowerCase().includes(s)));
  }, [people, q]);

  const reset = () => {
    setPicked(null);
    setVerified(null);
  };

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <div className="brand">
          <span className="brand-logo">
            <CalendarCheck size={20} />
          </span>
          <div>
            <div className="brand-name">AttendPro</div>
            <div className="brand-sub">Attendance Kiosk</div>
          </div>
        </div>
        <div className="kiosk-clock">
          <div id="k-clock">{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</div>
          <div>{formatDate(todayInTz(TZ), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {active && (
            <button
              className="btn kiosk-exit"
              title="Remove kiosk activation from this device"
              onClick={() => {
                localStorage.removeItem(KEY);
                setActive(false);
              }}
            >
              Deactivate
            </button>
          )}
          <button className="btn kiosk-exit" onClick={() => navigate('/')}>
            <LogOut size={16} /> Exit kiosk
          </button>
        </div>
      </header>

      {!active ? (
        <Activate onDone={() => setActive(true)} />
      ) : (
        <main className="kiosk-body">
          <h1>Tap your name to register your attendance</h1>
          <p>Each person clocks in, clocks out and logs OT for themselves with their own 4-digit PIN.</p>
          <div className="input-icon kiosk-search">
            <Search size={16} />
            <input placeholder="Search your name or employee ID…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </div>
          {people && list.length === 0 ? (
            <EmptyState title="No one matches your search" />
          ) : (
            <div className="kiosk-grid">
              {list.map((p) => (
                <button key={p._id} className="kiosk-card" onClick={() => setPicked(p)}>
                  <Avatar name={p.name} size={52} brand />
                  <span className="kiosk-name">{p.name}</span>
                  <span className="kiosk-sub">
                    {p.employeeId} · {p.department}
                  </span>
                  <span className={`kiosk-status k-${p.tone}`}>{p.status}</span>
                </button>
              ))}
            </div>
          )}
          <p className="kiosk-note">Forgot your PIN? Ask HR to reset it from the Employees page.</p>
        </main>
      )}

      {picked && !verified && <PinPad person={picked} onClose={reset} onVerified={(pin, state) => setVerified({ pin, state })} />}
      {picked && verified && (
        <Actions
          person={picked}
          pin={verified.pin}
          state={verified.state}
          onClose={reset}
          onDone={(message) => {
            setDone({ name: picked.name, message });
            reset();
            load();
          }}
        />
      )}
      {done && (
        <Modal open title="Attendance registered" onClose={() => setDone(null)} width={380}>
          <div className="k-done">
            <CheckCircle2 size={56} />
            <strong>{done.name}</strong>
            <span>{done.message}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}
