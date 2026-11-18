import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Avatar, PageHeader } from '../components/UI';
import { formatDate } from '../utils/format';

export default function Profile() {
  const { user, isAdmin } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast.error('New passwords do not match');
    setBusy(true);
    try {
      const { data } = await api.put('/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success(data.message);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    ['Email', user.email],
    ['Role', isAdmin ? 'Administrator' : 'Employee'],
    ...(isAdmin
      ? []
      : [
          ['Employee ID', user.employeeId],
          ['Department', user.department],
          ['Designation', user.designation],
          ['Phone', user.phone],
          ['Joined', user.joinDate ? formatDate(user.joinDate) : ''],
        ]),
  ];

  return (
    <>
      <PageHeader title="My Profile" subtitle="Your account details and security settings" />
      <div className="grid-2">
        <div className="card">
          <div className="profile-head">
            <Avatar name={user.name} size={64} />
            <div>
              <h3>{user.name}</h3>
              <span className="muted">{user.designation || (isAdmin ? 'Administrator' : 'Employee')}</span>
            </div>
          </div>
          <dl className="details">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <form className="card" onSubmit={submit}>
          <div className="card-head">
            <h3>
              <KeyRound size={18} /> Change password
            </h3>
          </div>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </>
  );
}
