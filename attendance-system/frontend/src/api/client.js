import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';

// Download a file (Excel/PDF) from an authenticated endpoint
export async function downloadFile(url, params, fallbackName) {
  try {
    const res = await api.get(url, { params, responseType: 'blob' });
    const disposition = res.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const name = match ? match[1] : fallbackName;
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch (e) {
    // Error bodies come back as Blob when responseType is 'blob'
    if (e?.response?.data instanceof Blob) {
      const text = await e.response.data.text();
      try {
        throw new Error(JSON.parse(text).message);
      } catch (parsed) {
        throw parsed instanceof Error ? parsed : new Error(text);
      }
    }
    throw e;
  }
}

export default api;
