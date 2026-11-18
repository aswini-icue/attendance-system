import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Clock, File, Folder, FolderOpen, Palmtree, Search, Trash2, Upload, Thermometer, X } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import api, { downloadFile, errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EmptyState, Modal, StatusBadge } from '../components/UI';
import Loader from '../components/Loader';
import { LeaveStatus } from '../components/workspace/LeaveTab';
import { formatDate, hoursDec, initials, minutesToHM, money, monthLabel, toHHMM, todayInTz, weekday } from '../utils/format';

const COLORS = { onTime: '#F7931E', late: '#8B3FE0', absent: '#D5CFF5' };
const TABS = [
  ['overview', 'Overview'],
  ['attendance', 'Attendance'],
  ['timeoff', 'Time off'],
  ['payroll', 'Payroll'],
  ['documents', 'Documents'],
];
const shortMonth = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });

function RateTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="ed-tip">
      <strong>{label}</strong>
      {d.days ? (
        <>
          <div>
            <i style={{ background: COLORS.onTime }} />
            {d.onTime}% <span>On time</span>
          </div>
          <div>
            <i style={{ background: COLORS.late }} />
            {d.late}% <span>Late</span>
          </div>
          <div>
            <i style={{ background: COLORS.absent }} />
            {d.absent}% <span>Absent</span>
          </div>
        </>
      ) : (
        <div className="muted">No attendance recorded</div>
      )}
    </div>
  );
}

function PayrollTable({ rows, perPage, onSlip }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const view = rows.slice((page - 1) * perPage, page * perPage);
  const nums = [];
  for (let i = 1; i <= pages; i += 1) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <>
      <div className="ed-sec-head">
        <h3>Recent Payroll</h3>
        <div className="ed-pager">
          {nums.map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`}>…</span>
            ) : (
              <button key={n} className={n === page ? 'on' : ''} onClick={() => setPage(n)}>
                {n}
              </button>
            )
          )}
          <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}>
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>
      <div className="ed-table-wrap">
        <table className="ed-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Pay period</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {view.length ? (
              view.map((r, i) => (
                <tr key={r.month}>
                  <td>{(page - 1) * perPage + i + 1}</td>
                  <td>{r.label}</td>
                  <td>{r.payDate ? formatDate(r.payDate) : '—'}</td>
                  <td>{money(r.amount)}</td>
                  <td>
                    <button className="ed-pill-btn" onClick={() => onSlip(r.month)} title="View salary slip">
                      <span className={`ed-status ${r.status === 'Paid' ? 'paid' : 'pending'}`}>{r.status}</span>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted">
                  No payroll yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DocsPanel({ employeeId, counts, full, onChanged }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ folder: 'Uploads', file: null });

  const load = useCallback(() => {
    api
      .get(`/employees/${employeeId}/documents`)
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(errMsg(e)));
  }, [employeeId]);

  useEffect(load, [load]);

  const upload = async (e) => {
    e.preventDefault();
    if (!form.file) return toast.error('Choose a file');
    const fd = new FormData();
    fd.append('folder', form.folder);
    fd.append('file', form.file);
    try {
      await api.post(`/employees/${employeeId}/documents`, fd);
      toast.success(`${form.file.name} uploaded`);
      setUploading(false);
      setOpen(form.folder);
      setForm({ folder: 'Uploads', file: null });
      load();
      onChanged?.();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const remove = async (doc) => {
    try {
      await api.delete(`/documents/${doc._id}`);
      toast.success('Document deleted');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const folders = data?.folders || [];
  const items = data?.items || [];
  return (
    <div className={`ed-docs ${full ? 'full' : ''}`}>
      <h3>Documents</h3>
      <ul>
        {folders
          .filter((f) => f !== 'Uploads' || items.some((d) => d.folder === f))
          .map((f) => {
            const list = items.filter((d) => d.folder === f);
            const isOpen = full || open === f;
            return (
              <li key={f}>
                <button className="ed-folder" onClick={() => setOpen(open === f ? null : f)}>
                  {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
                  <span>{f}</span>
                  <em>{list.length || counts?.[f] || 0}</em>
                </button>
                {isOpen && (
                  <div className="ed-files">
                    {list.length ? (
                      list.map((d) => (
                        <div key={d._id}>
                          <File size={13} />
                          <button className="ed-fname link-btn" onClick={() => downloadFile(`/documents/${d._id}/download`, {}, d.name).catch((e) => toast.error(errMsg(e)))}>
                            {d.name}
                          </button>
                          {full && (
                            <button className="icon-btn danger" title="Delete" onClick={() => remove(d)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="muted small">No files</div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
      </ul>
      <button className="ed-upload" onClick={() => setUploading(true)}>
        <Upload size={16} /> Upload
      </button>

      <Modal open={uploading} title="Upload document" onClose={() => setUploading(false)} width={460}>
        <form onSubmit={upload}>
          <label className="field">
            <span>Folder</span>
            <select value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })}>
              {folders.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>File (PDF, image, Word, Excel or text · max 5 MB)</span>
            <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files[0] || null })} required />
          </label>
          <div className="modal-foot inline">
            <button type="button" className="btn btn-ghost" onClick={() => setUploading(false)}>
              Cancel
            </button>
            <button className="btn btn-primary">
              <Upload size={16} /> Upload
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Tiles({ b }) {
  return (
    <div className="ed-tiles">
      <div className="ed-tile t-orange">
        <Palmtree className="ed-tile-art" />
        <span>Vacation</span>
        <strong>{b.vacationHours} h</strong>
        <small>{b.vacationScheduledHours} hours scheduled</small>
      </div>
      <div className="ed-tile t-purple">
        <Thermometer className="ed-tile-art" />
        <span>Sick days</span>
        <strong>{b.sickHours} h</strong>
        <small>{b.sickScheduledHours} hours scheduled</small>
      </div>
      <div className="ed-tile t-grey">
        <Clock className="ed-tile-art" />
        <span>Overtime</span>
        <strong>{hoursDec(b.otMinutesThisMonth)} h</strong>
        <small>this month · {hoursDec(b.otMinutesThisYear)} h this year</small>
      </div>
      <div className="ed-tile t-black">
        <X className="ed-tile-art" />
        <span>Absences</span>
        <strong>{b.absencesThisYear} d</strong>
        <small>this year</small>
      </div>
    </div>
  );
}

function AttendanceTabView({ employeeId, tz }) {
  const thisMonth = todayInTz(tz).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api
      .get(`/attendance/employee/${employeeId}`, { params: { month } })
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(errMsg(e)));
  }, [employeeId, month]);
  const rows = useMemo(() => {
    if (!data) return [];
    const m = new Map(data.holidays.map((h) => [h.date, { date: h.date, holiday: h.name }]));
    data.records.forEach((r) => m.set(r.date, { ...m.get(r.date), date: r.date, r }));
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);
  const s = data?.summary;
  const total = s ? s.Present + s.Late + s['Half-day'] + s.Absent : 0;
  const pct = (n) => (total ? `${Math.round((n / total) * 1000) / 10}%` : '—');
  return (
    <>
      <div className="ed-sec-head">
        <h3>Attendance · {monthLabel(month)}</h3>
        <input type="month" value={month} max={thisMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {!data ? (
        <Loader />
      ) : (
        <>
          <div className="ed-mini-kpis">
            <div>
              <strong>{pct(s.Present)}</strong>
              <span>On time</span>
            </div>
            <div>
              <strong>{pct(s.Late + s['Half-day'])}</strong>
              <span>Late / half day</span>
            </div>
            <div>
              <strong>{pct(s.Absent)}</strong>
              <span>Absent</span>
            </div>
            <div>
              <strong>{minutesToHM(s.otMinutes)}</strong>
              <span>Overtime</span>
            </div>
          </div>
          <div className="ed-table-wrap">
            <table className="ed-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map(({ date, holiday, r }) =>
                    r ? (
                      <tr key={date}>
                        <td>
                          {formatDate(date)} <span className="muted small">{weekday(date)}</span>
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td>{toHHMM(r.checkIn, tz) || '—'}</td>
                        <td>{toHHMM(r.checkOut, tz) || '—'}</td>
                        <td>
                          {hoursDec(r.workMinutes)}
                          {r.otMinutes > 0 && <span className="ot-tag"> +{hoursDec(r.otMinutes)} OT</span>}
                        </td>
                      </tr>
                    ) : (
                      <tr key={date}>
                        <td>{formatDate(date)}</td>
                        <td>
                          <span className="badge badge-holiday">Holiday</span>
                        </td>
                        <td colSpan={3} className="muted">
                          {holiday}
                        </td>
                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">
                      No attendance this month
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function TimeOffView({ employeeId, b }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api
      .get('/leaves', { params: { employee: employeeId, status: 'All' } })
      .then(({ data }) => setItems(data.items))
      .catch((e) => toast.error(errMsg(e)));
  }, [employeeId]);
  return (
    <>
      <div className="ed-sec-head">
        <h3>Time off · this year</h3>
      </div>
      <div className="ed-mini-kpis">
        <div>
          <strong>
            {b.vacationUsedDays} / {b.allowance.vacation}
          </strong>
          <span>Vacation days used</span>
        </div>
        <div>
          <strong>
            {b.sickUsedDays} / {b.allowance.sick}
          </strong>
          <span>Sick days used</span>
        </div>
        <div>
          <strong>{(b.vacationScheduledHours + b.sickScheduledHours) / 8}</strong>
          <span>Days scheduled</span>
        </div>
        <div>
          <strong>{b.absencesThisYear}</strong>
          <span>Absences</span>
        </div>
      </div>
      {!items ? (
        <Loader />
      ) : (
        <div className="ed-table-wrap">
          <table className="ed-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((l) => (
                  <tr key={l._id}>
                    <td>{l.leaveType}</td>
                    <td>{formatDate(l.fromDate)}</td>
                    <td>{formatDate(l.toDate)}</td>
                    <td>{l.days}</td>
                    <td className="wrap">{l.reason}</td>
                    <td>
                      <LeaveStatus status={l.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    No leave requests
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SlipModal({ employee, month, onClose }) {
  const [p, setP] = useState(null);
  useEffect(() => {
    api
      .get(`/employees/${employee._id}/payslip`, { params: { month } })
      .then(({ data }) => setP(data))
      .catch((e) => toast.error(errMsg(e)));
  }, [employee._id, month]);
  return (
    <Modal open title={`${employee.name} · ${monthLabel(month)}`} onClose={onClose} width={520}>
      {!p ? (
        <Loader />
      ) : (
        <>
          <div className="slip-meta" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div>
              <span>Working days</span>
              <strong>{p.workingDays}</strong>
            </div>
            <div>
              <span>Paid days</span>
              <strong>{p.paidDays}</strong>
            </div>
            <div>
              <span>LOP days</span>
              <strong>{p.lopDays}</strong>
            </div>
            <div>
              <span>Overtime</span>
              <strong>{minutesToHM(p.counts.otMinutes)}</strong>
            </div>
          </div>
          <table className="table slip">
            <tbody>
              {p.earnings.map(([n, v]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="num">{money(v)}</td>
                </tr>
              ))}
              {p.deductions.map(([n, v]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="num tone-text-red">− {money(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="net-pay" style={{ marginTop: 14 }}>
            <span>Net pay</span>
            <strong>{money(p.netPay)}</strong>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function EmployeeDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings } = useAuth();
  const tz = settings.timezone;
  const [list, setList] = useState([]);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [slip, setSlip] = useState(null);
  const [info, setInfo] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get('/employees', { params: { status: 'active', limit: 1000 } })
      .then(({ data: d }) => setList(d.items))
      .catch((e) => toast.error(errMsg(e)));
  }, []);

  // No id in the URL: open the first employee
  useEffect(() => {
    if (!id && list.length) navigate(`/employee-dashboard/${list[0]._id}`, { replace: true });
  }, [id, list, navigate]);

  const load = useCallback(() => {
    if (!id) return;
    setData(null);
    api
      .get(`/employees/${id}/overview`)
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(errMsg(e)));
  }, [id]);

  useEffect(load, [load]);

  const next = () => {
    const i = list.findIndex((e) => e._id === id);
    if (list.length) navigate(`/employee-dashboard/${list[(i + 1) % list.length]._id}`);
  };

  const onSearch = (value) => {
    setSearch(value);
    const hit = list.find((e) => value.includes(e.employeeId) || e.name.toLowerCase() === value.toLowerCase());
    if (hit) {
      setSearch('');
      navigate(`/employee-dashboard/${hit._id}`);
    }
  };

  if (!id || !data) return <Loader />;
  const e = data.employee;
  const chartData = data.rates.map((r) => ({ ...r, label: shortMonth(r.month) }));

  return (
    <div className="ed">
      <div className="ed-top">
        <Link to="/employees" className="ed-back">
          <ArrowLeft size={20} /> <h1>Employees</h1>
        </Link>
        <div className="input-icon ed-search">
          <Search size={16} />
          <input list="ed-emps" placeholder="Search employee…" value={search} onChange={(ev) => onSearch(ev.target.value)} />
          <datalist id="ed-emps">
            {list.map((x) => (
              <option key={x._id} value={`${x.name} · ${x.employeeId}`} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="ed-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="ed-grid">
        <div className="ed-main">
          <div className="ed-person">
            <span className="ed-avatar">{initials(e.name)}</span>
            <div className="ed-person-text">
              <h2>{e.name}</h2>
              <span>{[e.designation, e.department].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="ed-person-actions">
              <button className="ed-btn-outline" onClick={() => setInfo(true)}>
                Info
              </button>
              <button className="ed-btn-solid" onClick={next}>
                Next employee <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {tab === 'overview' && (
            <>
              <div className="ed-sec-head">
                <h3>Attendance Rate</h3>
                <div className="ed-legend">
                  <i style={{ background: COLORS.onTime }} />
                  On time
                  <i style={{ background: COLORS.late }} />
                  Late
                  <i style={{ background: COLORS.absent }} />
                  Absent
                </div>
              </div>
              <div className="ed-chart">
                <ResponsiveContainer>
                  <BarChart data={chartData} barSize={24}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v} %`} tickLine={false} axisLine={false} fontSize={11} width={44} />
                    <Tooltip content={<RateTooltip />} cursor={{ fill: '#f6f5fd' }} />
                    <Bar dataKey="onTime" stackId="a" fill={COLORS.onTime} radius={[6, 6, 6, 6]} />
                    <Bar dataKey="late" stackId="a" fill={COLORS.late} radius={[6, 6, 6, 6]} />
                    <Bar dataKey="absent" stackId="a" fill={COLORS.absent} radius={[6, 6, 6, 6]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <PayrollTable rows={data.payroll} perPage={5} onSlip={setSlip} />
            </>
          )}
          {tab === 'attendance' && <AttendanceTabView employeeId={id} tz={tz} />}
          {tab === 'timeoff' && <TimeOffView employeeId={id} b={data.balances} />}
          {tab === 'payroll' && (
            <>
              <PayrollTable rows={data.payroll} perPage={12} onSlip={setSlip} />
              <p className="muted small" style={{ marginTop: 10 }}>
                Click a status to view that month&apos;s salary slip. Monthly salary: {money(e.salary)}.
              </p>
            </>
          )}
          {tab === 'documents' && <DocsPanel employeeId={id} counts={data.documents} full onChanged={load} />}
        </div>

        <aside className="ed-side">
          <DocsPanel key={`side-${id}`} employeeId={id} counts={data.documents} />
          <Tiles b={data.balances} />
        </aside>
      </div>

      {slip && <SlipModal employee={e} month={slip} onClose={() => setSlip(null)} />}
      <Modal
        open={info}
        title={e.name}
        onClose={() => setInfo(false)}
        width={480}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setInfo(false)}>
              Close
            </button>
            <Link to="/employees" className="btn btn-primary">
              Edit on Employees page
            </Link>
          </>
        }
      >
        <dl className="details">
          {[
            ['Employee ID', e.employeeId],
            ['Email', e.email],
            ['Phone', e.phone],
            ['Department', e.department],
            ['Designation', e.designation],
            ['Joined', e.joinDate ? formatDate(e.joinDate) : ''],
            ['Monthly salary', money(e.salary)],
            ['Kiosk PIN', e.hasPin ? 'Set' : 'Not set'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || '—'}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
