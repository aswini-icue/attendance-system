import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EmptyState, PageHeader, PersonCell, StatusBadge } from '../components/UI';
import Loader from '../components/Loader';
import { formatDate, todayInTz, weekday } from '../utils/format';

const TYPES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom range' },
];

export default function Reports() {
  const { settings } = useAuth();
  const today = todayInTz(settings.timezone);
  const [params, setParams] = useState({
    type: 'daily',
    date: today,
    month: today.slice(0, 7),
    from: `${today.slice(0, 7)}-01`,
    to: today,
    department: '',
    employee: '',
  });
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [report, setReport] = useState(null);
  const [view, setView] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    Promise.all([api.get('/employees/departments'), api.get('/employees', { params: { limit: 1000 } })])
      .then(([d, e]) => {
        setDepartments(d.data);
        setEmployees(e.data.items);
      })
      .catch((e) => toast.error(errMsg(e)));
  }, []);

  const query = () => {
    const q = { type: params.type, department: params.department || undefined, employee: params.employee || undefined };
    if (params.type === 'daily' || params.type === 'weekly') q.date = params.date;
    if (params.type === 'monthly') q.month = params.month;
    if (params.type === 'custom') Object.assign(q, { from: params.from, to: params.to });
    return q;
  };

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports', { params: query() });
      setReport(data);
      setView(data.type === 'daily' ? 'details' : 'summary');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportAs = async (kind) => {
    setExporting(kind);
    try {
      await downloadFile(`/reports/export/${kind}`, query(), `attendance-report.${kind === 'excel' ? 'xlsx' : 'pdf'}`);
      toast.success(`${kind === 'excel' ? 'Excel' : 'PDF'} downloaded`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting('');
    }
  };

  const set = (k) => (e) => setParams({ ...params, [k]: e.target.value });
  const visibleEmployees = params.department ? employees.filter((e) => e.department === params.department) : employees;

  return (
    <>
      <PageHeader
        title="Attendance Reports"
        subtitle="Generate daily, weekly and monthly reports and export to Excel or PDF"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => exportAs('excel')} disabled={!!exporting}>
              <FileSpreadsheet size={16} /> {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
            </button>
            <button className="btn btn-ghost" onClick={() => exportAs('pdf')} disabled={!!exporting}>
              <FileText size={16} /> {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </button>
          </>
        }
      />

      <div className="card">
        <div className="segmented">
          {TYPES.map((t) => (
            <button
              key={t.key}
              className={params.type === t.key ? 'active' : ''}
              onClick={() => setParams({ ...params, type: t.key })}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="toolbar wrap-row">
          {(params.type === 'daily' || params.type === 'weekly') && (
            <label className="field compact">
              <span>{params.type === 'weekly' ? 'Any date in week' : 'Date'}</span>
              <input type="date" value={params.date} max={today} onChange={set('date')} />
            </label>
          )}
          {params.type === 'monthly' && (
            <label className="field compact">
              <span>Month</span>
              <input type="month" value={params.month} onChange={set('month')} />
            </label>
          )}
          {params.type === 'custom' && (
            <>
              <label className="field compact">
                <span>From</span>
                <input type="date" value={params.from} onChange={set('from')} />
              </label>
              <label className="field compact">
                <span>To</span>
                <input type="date" value={params.to} min={params.from} onChange={set('to')} />
              </label>
            </>
          )}
          <label className="field compact">
            <span>Department</span>
            <select value={params.department} onChange={(e) => setParams({ ...params, department: e.target.value, employee: '' })}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="field compact">
            <span>Employee</span>
            <select value={params.employee} onChange={set('employee')}>
              <option value="">All employees</option>
              {visibleEmployees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name} ({e.employeeId})
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary align-end" onClick={generate} disabled={loading}>
            <Play size={16} /> {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {loading && !report && <Loader />}
      {report && (
        <>
          <div className="report-banner">
            <div>
              <h3>{report.label}</h3>
              <span className="muted small">
                {formatDate(report.from)} – {formatDate(report.to)} · {report.workingDays} working day(s) elapsed ·{' '}
                {report.employees} employee(s)
              </span>
            </div>
            <div className="report-kpis">
              <Kpi label="Present" value={report.totals.present} tone="green" />
              <Kpi label="Late" value={report.totals.late} tone="amber" />
              <Kpi label="Half-day" value={report.totals.halfDay} tone="indigo" />
              <Kpi label="Absent" value={report.totals.absent} tone="red" />
              <Kpi label="Leave" value={report.totals.leave} tone="sky" />
              <Kpi label="Not marked" value={report.totals.notMarked} tone="slate" />
              <Kpi label="OT hrs" value={report.totals.otHours} tone="violet" />
            </div>
          </div>

          <div className="tabs">
            <button className={`tab ${view === 'summary' ? 'active' : ''}`} onClick={() => setView('summary')}>
              Employee summary
            </button>
            <button className={`tab ${view === 'details' ? 'active' : ''}`} onClick={() => setView('details')}>
              Day-wise details <span className="tab-count muted-count">{report.details.length}</span>
            </button>
          </div>

          <div className="card">
            {view === 'summary' ? (
              report.summary.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th className="num">Present</th>
                        <th className="num">Late</th>
                        <th className="num">Half-day</th>
                        <th className="num">Absent</th>
                        <th className="num">Leave</th>
                        <th className="num">Not marked</th>
                        <th className="num">Work hrs</th>
                        <th className="num">OT hrs</th>
                        <th>Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.summary.map((s) => (
                        <tr key={s.employeeId}>
                          <td>
                            <PersonCell name={s.name} sub={s.employeeId} />
                          </td>
                          <td>{s.department}</td>
                          <td className="num">{s.present}</td>
                          <td className="num">{s.late}</td>
                          <td className="num">{s.halfDay}</td>
                          <td className="num">{s.absent}</td>
                          <td className="num">{s.leave}</td>
                          <td className="num">{s.notMarked}</td>
                          <td className="num">{s.workHours}</td>
                          <td className="num">{s.otHours || '—'}</td>
                          <td>
                            <div className="pct">
                              <div className="progress">
                                <span
                                  style={{ width: `${Math.min(100, s.attendancePct)}%` }}
                                  className={s.attendancePct < 75 ? 'low' : ''}
                                />
                              </div>
                              <span>{s.attendancePct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No employees match these filters" />
              )
            ) : report.details.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th className="num">Work hrs</th>
                      <th className="num">OT hrs</th>
                      <th>Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.details.map((d) => (
                      <tr key={d.id}>
                        <td className="nowrap">
                          {formatDate(d.date)} <span className="muted small">{weekday(d.date)}</span>
                        </td>
                        <td>
                          <PersonCell name={d.name} sub={d.employeeId} />
                        </td>
                        <td>{d.department}</td>
                        <td>{d.checkInText}</td>
                        <td>{d.checkOutText}</td>
                        <td className="num">{d.workHours || '—'}</td>
                        <td className="num">{d.otHours || '—'}</td>
                        <td>
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="muted">{d.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No attendance records in this period" />
            )}
          </div>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div className={`kpi tone-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
