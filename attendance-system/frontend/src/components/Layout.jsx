import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CalendarOff,
  CalendarHeart,
  FileBarChart2,
  Clock,
  UserCircle,
  LogOut,
  Menu,
  CalendarCheck,
  Contact,
  ChevronRight,
  BookUser,
  Tablet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './UI';
import { formatDate, todayInTz } from '../utils/format';

const ADMIN_NAV = [
  ['My Workspace', [{ to: '/workspace', label: 'My Workspace', icon: Contact }]],
  [
    'Administration',
    [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/employee-dashboard', label: 'Employee Dashboard', icon: BookUser },
      { to: '/employees', label: 'Employees', icon: Users },
      { to: '/attendance', label: 'Attendance Register', icon: ClipboardCheck },
      { to: '/team-timesheets', label: 'Team Timesheets', icon: Clock },
      { to: '/kiosk', label: 'Attendance Kiosk', icon: Tablet },
      { to: '/leaves', label: 'Leave Requests', icon: CalendarOff },
      { to: '/holidays', label: 'Holidays', icon: CalendarHeart },
      { to: '/reports', label: 'Reports', icon: FileBarChart2 },
    ],
  ],
  ['Account', [{ to: '/profile', label: 'My Profile', icon: UserCircle }]],
];

const EMP_NAV = [
  ['My Workspace', [{ to: '/', label: 'My Workspace', icon: Contact, end: true }]],
  ['Account', [{ to: '/profile', label: 'My Profile', icon: UserCircle }]],
];

export default function Layout() {
  const { user, isAdmin, logout, settings } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const nav = isAdmin ? ADMIN_NAV : EMP_NAV;

  let crumb = { section: '', label: '' };
  for (const [section, items] of nav) {
    const hit = items.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
    if (hit) crumb = { section, label: hit.label };
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-logo">
            <CalendarCheck size={20} />
          </span>
          <div>
            <div className="brand-name">AttendPro</div>
            <div className="brand-sub">Attendance Suite</div>
          </div>
        </div>
        <nav className="nav">
          {nav.map(([section, items]) => (
            <div key={section}>
              <div className="nav-section">{section}</div>
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className="nav-link" onClick={() => setOpen(false)}>
                  <Icon size={17} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <Avatar name={user?.name} size={30} brand />
          <div className="side-user-text">
            <div className="side-user-name">{user?.name}</div>
            <div className="side-user-role">{isAdmin ? 'Administrator' : 'Employee'}</div>
          </div>
          <button className="icon-btn side-logout" onClick={handleLogout} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="crumbs">
            <strong className="crumb-brand">AttendPro</strong>
            <span className="crumb-sep-bar" />
            <span>{crumb.section}</span>
            <ChevronRight size={13} />
            <strong>{crumb.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-date">
              {formatDate(todayInTz(settings.timezone), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <Avatar name={user?.name} size={34} brand />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <footer className="app-foot">© {new Date().getFullYear()} {import.meta.env.VITE_COMPANY_NAME || 'Your Company'}</footer>
      </div>
    </div>
  );
}
