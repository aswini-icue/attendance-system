import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from './components/Loader';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import AttendanceRegister from './pages/AttendanceRegister';
import TeamTimesheets from './pages/TeamTimesheets';
import Workspace from './pages/Workspace';
import Leaves from './pages/Leaves';
import Holidays from './pages/Holidays';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Kiosk from './pages/Kiosk';
import EmployeeDashboard from './pages/EmployeeDashboard';

function Home() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Dashboard /> : <Workspace />;
}

const adminOnly = (el) => <ProtectedRoute roles={['admin']}>{el}</ProtectedRoute>;

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loader full />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      {/* Shared attendance kiosk: works without a user session (device is activated by an admin) */}
      <Route path="/kiosk" element={<Kiosk />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="workspace" element={<Workspace />} />
        <Route path="profile" element={<Profile />} />
        <Route path="employees" element={adminOnly(<Employees />)} />
        <Route path="employee-dashboard" element={adminOnly(<EmployeeDashboard />)} />
        <Route path="employee-dashboard/:id" element={adminOnly(<EmployeeDashboard />)} />
        <Route path="attendance" element={adminOnly(<AttendanceRegister />)} />
        <Route path="team-timesheets" element={adminOnly(<TeamTimesheets />)} />
        <Route path="leaves" element={adminOnly(<Leaves />)} />
        <Route path="holidays" element={adminOnly(<Holidays />)} />
        <Route path="reports" element={adminOnly(<Reports />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
