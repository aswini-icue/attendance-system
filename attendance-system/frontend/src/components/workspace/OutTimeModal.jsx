import { useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../UI';
import { minutesToHM, toHHMM } from '../../utils/format';

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// OT (Out Time): record the time you actually stopped working for a shift.
// After the shift end => overtime. Before => left early. Also fixes a forgotten clock-out.
export default function OutTimeModal({ state, session, nowMs, onClose, onSaved }) {
  const { settings } = useAuth();
  const tz = settings.timezone;
  const shift = state.shifts.find((s) => s.key === session.shift);
  const [form, setForm] = useState({
    time: session.out ? toHHMM(session.out, tz) : toHHMM(new Date(nowMs).toISOString(), tz),
    reason: state.otReasons[0],
    note: '',
  });
  const [busy, setBusy] = useState(false);

  const diff = form.time ? toMin(form.time) - toMin(shift.end) : 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/attendance/out-time', { shift: session.shift, ...form });
      onSaved(data);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="OT · Record Out Time" onClose={onClose} width={500}>
      <form onSubmit={submit}>
        <div className="ot-summary">
          <div>
            <span>Shift</span>
            <strong>
              {shift.label} {shift.start}–{shift.end}
            </strong>
          </div>
          <div>
            <span>Clocked in</span>
            <strong>{toHHMM(session.in, tz)}</strong>
          </div>
          <div>
            <span>Current out</span>
            <strong>{session.out ? `${toHHMM(session.out, tz)}${session.auto ? ' (auto)' : ''}` : 'still working'}</strong>
          </div>
        </div>
        <p className="muted small" style={{ margin: '14px 0' }}>
          Enter the time you actually stopped working. An out time later than {shift.end} is counted as <strong>overtime</strong>; an
          earlier one records that you left early.
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Out time *</span>
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
          </label>
          <label className="field">
            <span>Reason *</span>
            <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {state.otReasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="field span-2">
            <span>Note (optional)</span>
            <input
              value={form.note}
              maxLength={200}
              placeholder="e.g. Finished slab inspection at site B"
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
        </div>
        <div className="ot-preview">
          {form.time &&
            (diff > 0 ? (
              <>
                <span className="ot-tag">+{minutesToHM(diff)} overtime</span> beyond the {shift.end} shift end
              </>
            ) : diff < 0 ? (
              <span className="s-chip chip-missed">Leaving {minutesToHM(-diff)} early</span>
            ) : (
              'Exactly at shift end'
            ))}
        </div>
        <div className="modal-foot inline">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            <Save size={16} /> {busy ? 'Saving…' : 'Save out time'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
