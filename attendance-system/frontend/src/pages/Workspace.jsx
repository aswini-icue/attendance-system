import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, ClipboardList, Clock, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/UI';
import { money } from '../utils/format';
import AttendanceTab from '../components/workspace/AttendanceTab';
import TimesheetTab from '../components/workspace/TimesheetTab';
import LeaveTab from '../components/workspace/LeaveTab';
import SalaryTab from '../components/workspace/SalaryTab';

const TABS = [
  { key: 'attendance', label: 'My Attendance', icon: CalendarCheck },
  { key: 'timesheet', label: 'My Timesheet', icon: ClipboardList },
  { key: 'leave', label: 'My Leave', icon: CalendarDays },
  { key: 'salary', label: 'My Salary Slip', icon: IndianRupee },
];

function WsStat({ icon: Icon, value, label, sub, tone }) {
  return (
    <div className="ws-stat">
      <div className={`ws-stat-icon tone-${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="ws-stat-value">{value}</div>
        <div className="ws-stat-label">{label}</div>
        {sub && <div className="ws-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function Workspace() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState('attendance');
  const [summary, setSummary] = useState(null);

  const loadSummary = useCallback(() => {
    api
      .get('/workspace/summary')
      .then(({ data }) => setSummary(data))
      .catch((e) => toast.error(errMsg(e)));
  }, []);

  useEffect(loadSummary, [loadSummary]);

  const s = summary;
  return (
    <div className="ws">
      <PageHeader
        title="My Workspace"
        subtitle={[user.name, user.designation || (isAdmin ? 'Admin' : 'Employee'), user.employeeId].filter(Boolean).join(' · ')}
      />

      <div className="ws-stats">
        <WsStat
          icon={CalendarCheck}
          value={s ? s.daysWorked : '—'}
          label="Days worked this month"
          sub={s ? (s.halfDays ? `includes ${s.halfDays} half day${s.halfDays > 1 ? 's' : ''}` : 'no half days') : ''}
          tone="green"
        />
        <WsStat icon={CalendarDays} value={s ? s.leaveTaken : '—'} label="Leave taken" sub="this month" tone="amber" />
        <WsStat icon={Clock} value={s ? s.leavePendingDays : '—'} label="Leave pending" sub="awaiting HR" tone="red" />
        <WsStat
          icon={IndianRupee}
          value={s ? money(s.netPay) : '—'}
          label="Net monthly pay"
          sub={s?.lopDays ? `after ${s.lopDays} LOP day(s)` : ''}
          tone="violet"
        />
      </div>

      <div className="ws-tabs">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`ws-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && <AttendanceTab onChanged={loadSummary} />}
      {tab === 'timesheet' && <TimesheetTab />}
      {tab === 'leave' && <LeaveTab onChanged={loadSummary} />}
      {tab === 'salary' && <SalaryTab />}
    </div>
  );
}
