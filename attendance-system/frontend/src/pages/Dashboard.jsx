import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  Clock3,
  UserX,
  CalendarOff,
  AlertCircle,
  Percent,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PageHeader, PersonCell, StatCard, StatusBadge } from '../components/UI';
import Loader from '../components/Loader';
import { formatDate, formatTime } from '../utils/format';

const COLORS = {
  Present: '#16a34a',
  Late: '#f59e0b',
  'Half-day': '#6366f1',
  Absent: '#ef4444',
  Leave: '#0ea5e9',
  'Not marked': '#cbd5e1',
};

export default function Dashboard() {
  const { settings, user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get('/dashboard')
      .then(({ data: d }) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !data) return <Loader />;
  if (error && !data) return <div className="alert alert-error">{error}</div>;

  const t = data.totals;
  const pie = [
    { name: 'Present', value: t.present },
    { name: 'Late', value: t.late },
    { name: 'Half-day', value: t.halfDay },
    { name: 'Absent', value: t.absent },
    { name: 'Leave', value: t.leave },
    { name: 'Not marked', value: t.notMarked },
  ].filter((p) => p.value > 0);

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`Attendance overview for ${formatDate(data.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <Link to="/attendance" className="btn btn-primary">
              Open Register
            </Link>
          </>
        }
      />

      {data.holiday && <div className="alert alert-info">Today is a holiday: {data.holiday}</div>}

      <div className="stats-grid">
        <StatCard icon={Users} label="Active Employees" value={t.employees} sub={`${t.workingNow} working right now`} tone="slate" />
        <StatCard icon={UserCheck} label="Present" value={t.present} sub="On time today" tone="green" />
        <StatCard icon={Clock3} label="Late / Half-day" value={`${t.late} / ${t.halfDay}`} tone="amber" />
        <StatCard icon={UserX} label="Absent" value={t.absent} tone="red" />
        <StatCard icon={CalendarOff} label="On Leave" value={t.leave} tone="sky" />
        <StatCard icon={AlertCircle} label="Not Marked" value={t.notMarked} tone="slate" />
        <StatCard icon={Percent} label="Attendance Rate" value={`${t.attendanceRate}%`} tone="indigo" />
        <StatCard
          icon={CalendarOff}
          label="Pending Leaves"
          value={t.pendingLeaves}
          sub={<Link to="/leaves">Review requests →</Link>}
          tone="violet"
        />
      </div>

      <div className="grid-2-1">
        <div className="card">
          <div className="card-head">
            <h3>Last 7 days</h3>
            <span className="muted small">Attendance by status</span>
          </div>
          <div style={{ height: 290 }}>
            <ResponsiveContainer>
              <BarChart data={data.trend} barSize={26}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {['Present', 'Late', 'Half-day', 'Absent', 'Leave'].map((k, i, arr) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="a"
                    fill={COLORS[k]}
                    radius={i === arr.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Today’s status</h3>
          </div>
          {pie.length ? (
            <div style={{ height: 290 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={62} outerRadius={95} paddingAngle={2}>
                    {pie.map((p) => (
                      <Cell key={p.name} fill={COLORS[p.name]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No employees yet" text="Add employees to see today’s breakdown." />
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Recent check-ins</h3>
            <Link to="/team-timesheets" className="link small">
              Team timesheets <ArrowRight size={14} />
            </Link>
          </div>
          {data.recentCheckIns.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCheckIns.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <PersonCell name={r.employee.name} sub={r.employee.department} />
                    </td>
                    <td>{formatTime(r.checkIn, settings.timezone)}</td>
                    <td>{r.working ? <span className="live">working</span> : formatTime(r.checkOut, settings.timezone)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No check-ins yet today" />
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Departments today</h3>
          </div>
          {data.departments.length ? (
            <div className="dept-list">
              {data.departments.map((d) => {
                const pct = d.total ? Math.round((d.present / d.total) * 100) : 0;
                return (
                  <div key={d.department} className="dept-row">
                    <div className="dept-top">
                      <span className="dept-name">{d.department}</span>
                      <span className="muted small">
                        {d.present}/{d.total} present · {d.leave} leave · {d.absent} absent
                      </span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No departments" />
          )}
        </div>
      </div>

      {data.pendingLeaves.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Pending leave requests</h3>
            <Link to="/leaves" className="link small">
              Review all <ArrowRight size={14} />
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {data.pendingLeaves.map((l) => (
                <tr key={l._id}>
                  <td>
                    <PersonCell name={l.employee?.name} sub={l.employee?.employeeId} />
                  </td>
                  <td>{l.leaveType}</td>
                  <td>
                    {formatDate(l.fromDate)} – {formatDate(l.toDate)}
                  </td>
                  <td>{l.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
