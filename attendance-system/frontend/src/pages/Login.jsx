import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarCheck, Eye, EyeOff, Lock, Mail, AlarmClock, BarChart3, Clock, Tablet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="brand brand-light">
          <span className="brand-logo">
            <CalendarCheck size={22} />
          </span>
          <div className="brand-name">AttendPro</div>
        </div>
        <div className="hero-copy">
          <h1>Workforce attendance, simplified.</h1>
          <p>Shift-based check-in, automatic clock-out, leave approvals, timesheets and payroll-ready reports in one secure place.</p>
          <ul className="hero-points">
            <li>
              <Clock size={18} /> Morning &amp; afternoon shifts with auto clock-out
            </li>
            <li>
              <BarChart3 size={18} /> Daily, weekly &amp; monthly reports
            </li>
            <li>
              <AlarmClock size={18} /> Out-time &amp; overtime tracking
            </li>
          </ul>
        </div>
        <div className="hero-foot">© {new Date().getFullYear()} {import.meta.env.VITE_COMPANY_NAME || 'Your Company'}</div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit} noValidate>
          <h2>Sign in</h2>
          <p className="muted">Use your company email and password.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <label className="field">
            <span>Email address</span>
            <div className="input-icon">
              <Mail size={17} />
              <input
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-icon">
              <Lock size={17} />
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button type="button" className="input-action" onClick={() => setShow(!show)} aria-label="Toggle password">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <button className="btn btn-primary btn-block btn-lg" disabled={loading || !form.email || !form.password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <Link to="/kiosk" className="btn btn-kiosk btn-block">
            <Tablet size={16} /> Open Attendance Kiosk
          </Link>
          <p className="muted small center">Forgot your password? Contact your administrator.</p>
        </form>
      </section>
    </div>
  );
}
