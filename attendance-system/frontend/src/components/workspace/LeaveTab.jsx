import { useCallback, useEffect, useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Modal } from '../UI';
import Loader from '../Loader';
import { formatDate, todayInTz } from '../../utils/format';

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Other'];

export function LeaveStatus({ status }) {
  const cls = { Pending: 'late', Approved: 'present', Rejected: 'absent', Cancelled: 'muted' }[status];
  return <span className={`badge badge-${cls}`}>{status}</span>;
}

export default function LeaveTab({ onChanged }) {
  const { settings } = useAuth();
  const today = todayInTz(settings.timezone);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leaveType: 'Casual', fromDate: today, toDate: today, reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/leaves/me')
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(errMsg(e)));
  }, []);

  useEffect(load, [load]);

  const apply = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/leaves', form);
      toast.success('Leave request submitted');
      setOpen(false);
      setForm({ leaveType: 'Casual', fromDate: today, toDate: today, reason: '' });
      load();
      onChanged?.();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    try {
      await api.delete(`/leaves/${id}`);
      toast.success('Request cancelled');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const pending = data?.items.filter((l) => l.status === 'Pending').length || 0;

  return (
    <div className="card flush">
      <div className="card-head padded">
        <div>
          <h3>My leave requests</h3>
          {data && (
            <span className="muted small">
              {data.approvedDays} approved day(s) · {pending} pending request(s)
            </span>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={16} /> Apply for Leave
        </button>
      </div>

      {!data ? (
        <Loader />
      ) : data.items.length === 0 ? (
        <EmptyState title="No leave requests yet" text="Use “Apply for Leave” to submit your first request." />
      ) : (
        <div className="table-wrap">
          <table className="table ws-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>HR comment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l._id}>
                  <td>{l.leaveType}</td>
                  <td>{formatDate(l.fromDate)}</td>
                  <td>{formatDate(l.toDate)}</td>
                  <td>{l.days}</td>
                  <td className="wrap">{l.reason}</td>
                  <td>
                    <LeaveStatus status={l.status} />
                  </td>
                  <td className="muted">{l.adminComment || '—'}</td>
                  <td className="right">
                    {l.status === 'Pending' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => cancel(l._id)}>
                        <Ban size={14} /> Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} title="Apply for Leave" onClose={() => setOpen(false)} width={520}>
        <form onSubmit={apply}>
          <div className="form-grid">
            <label className="field span-2">
              <span>Leave type</span>
              <select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}>
                {LEAVE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>From</span>
              <input
                type="date"
                value={form.fromDate}
                onChange={(e) =>
                  setForm({ ...form, fromDate: e.target.value, toDate: form.toDate < e.target.value ? e.target.value : form.toDate })
                }
                required
              />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={form.toDate} min={form.fromDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} required />
            </label>
            <label className="field span-2">
              <span>Reason</span>
              <textarea rows={3} value={form.reason} maxLength={500} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
            </label>
          </div>
          <div className="modal-foot inline">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
