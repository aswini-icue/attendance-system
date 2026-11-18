import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

const DEFAULT_SETTINGS = {
  timezone: 'Asia/Kolkata',
  lateGraceMinutes: 15,
  expectedDailyHours: 8,
  weeklyOffDays: [0],
  shifts: [
    { key: 'morning', label: 'Morning', start: '09:00', end: '13:00' },
    { key: 'afternoon', label: 'Afternoon', start: '15:00', end: '19:00' },
  ],
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        setSettings(data.settings || DEFAULT_SETTINGS);
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setSettings(data.settings || DEFAULT_SETTINGS);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, settings, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
