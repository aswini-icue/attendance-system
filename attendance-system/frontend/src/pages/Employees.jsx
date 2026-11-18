import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../api/client';
import { EmptyState, Modal, PageHeader, PersonCell } from '../components/UI';
import Loader from '../components/Loader';
import { formatDate, money } from '../utils/format';

const EMPTY = {
  name: '',
  email: '',
  employeeId: '',
  phone: '',
  department: '',
  designation: '',
  joinDate: '',
  salary: '',
  pin: '',
  password: '',
  status: 'active',
};

export default function Employees() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ q: '', department: '', status: '', page: 1 });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, deps] = await Promise.all([
        api.get('/employees', { params: { ...filters, limit: 10 } }),
        api.get('/employees/departments'),
      ]);
      setItems(data.items);
      setMeta({ total: data.total, pages: data.pages });
      setDepartments(deps.data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const id = setTimeout(load, 250); // debounce search typing
    return () => clearTimeout(id);
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY);
    setModal({ open: true, editing: null });
  };

  const openEdit = (emp) => {
    setForm({ ...EMPTY, ...emp, salary: emp.salary ?? '', pin: '', password: '' });
    setModal({ open: true, editing: emp });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, salary: Number(form.salary) || 0 };
      if (!payload.pin) delete payload.pin;
      else if (!/^\d{4}$/.test(payload.pin)) throw new Error('Kiosk PIN must be exactly 4 digits');
      if (!payload.password) delete payload.password;
      if (modal.editing) {
        await api.put(`/employees/${modal.editing._id}`, payload);
        toast.success('Employee updated');
      } else {
        await api.post('/employees', payload);
        toast.success('Employee added');
      }
      setModal({ open: false, editing: null });
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/employees/${confirm._id}`);
      toast.success('Employee deleted');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 });

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={`${meta.total} employee${meta.total === 1 ? '' : 's'} in the directory`}
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Employee
          </button>
        }
      />

      <div className="card">
        <div className="toolbar">
          <div className="input-icon grow">
            <Search size={16} />
            <input placeholder="Search by name, email, ID or designation…" value={filters.q} onChange={setFilter('q')} />
          </div>
          <select value={filters.department} onChange={setFilter('department')}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <Loader />
        ) : items.length === 0 ? (
          <EmptyState title="No employees found" text="Try a different search or add a new employee." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Emp ID</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Phone</th>
                  <th className="num">Salary</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((emp) => (
                  <tr key={emp._id}>
                    <td>
                      <Link to={`/employee-dashboard/${emp._id}`} className="link-btn" title="Open employee dashboard">
                        <PersonCell name={emp.name} sub={emp.email} />
                      </Link>
                    </td>
                    <td className="mono">{emp.employeeId}</td>
                    <td>{emp.department || '—'}</td>
                    <td>{emp.designation || '—'}</td>
                    <td>{emp.phone || '—'}</td>
                    <td className="num">{emp.salary ? money(emp.salary) : '—'}</td>
                    <td>{emp.joinDate ? formatDate(emp.joinDate) : '—'}</td>
                    <td>
                      <span className={`badge ${emp.status === 'active' ? 'badge-present' : 'badge-muted'}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="right nowrap">
                      <button className="icon-btn" title="Edit" onClick={() => openEdit(emp)}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setConfirm(emp)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.pages > 1 && (
          <div className="pagination">
            <span className="muted small">
              Page {filters.page} of {meta.pages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={filters.page >= meta.pages}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <Modal
        open={modal.open}
        title={modal.editing ? 'Edit Employee' : 'Add Employee'}
        onClose={() => setModal({ open: false, editing: null })}
        width={680}
      >
        <form onSubmit={save}>
          <div className="form-grid">
            <label className="field">
              <span>Full name *</span>
              <input value={form.name} onChange={setF('name')} required />
            </label>
            <label className="field">
              <span>Employee ID *</span>
              <input value={form.employeeId} onChange={setF('employeeId')} placeholder="EMP009" required />
            </label>
            <label className="field">
              <span>Email *</span>
              <input type="email" value={form.email} onChange={setF('email')} required />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={setF('phone')} />
            </label>
            <label className="field">
              <span>Department</span>
              <input value={form.department} onChange={setF('department')} list="dept-list" />
              <datalist id="dept-list">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Designation</span>
              <input value={form.designation} onChange={setF('designation')} />
            </label>
            <label className="field">
              <span>Joining date</span>
              <input type="date" value={form.joinDate} onChange={setF('joinDate')} />
            </label>
            <label className="field">
              <span>Monthly salary (₹)</span>
              <input type="number" min="0" step="500" value={form.salary} onChange={setF('salary')} />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={form.status} onChange={setF('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="field">
              <span>{modal.editing ? `Kiosk PIN (${modal.editing.hasPin ? 'set · enter to change' : 'not set'})` : 'Kiosk PIN (4 digits, default 1234)'}</span>
              <input inputMode="numeric" maxLength={4} value={form.pin} onChange={setF('pin')} placeholder="e.g. 4821" />
            </label>
            <label className="field">
              <span>{modal.editing ? 'Reset password (optional)' : 'Login password *'}</span>
              <input
                type="password"
                value={form.password}
                onChange={setF('password')}
                minLength={8}
                required={!modal.editing}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
              />
            </label>
          </div>
          <div className="modal-foot inline">
            <button type="button" className="btn btn-ghost" onClick={() => setModal({ open: false, editing: null })}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : modal.editing ? 'Save changes' : 'Add employee'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!confirm}
        title="Delete employee?"
        onClose={() => setConfirm(null)}
        width={440}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={remove}>
              Delete permanently
            </button>
          </>
        }
      >
        <p>
          This permanently removes <strong>{confirm?.name}</strong> along with all their attendance and leave history.
          To keep history, set the employee to <em>Inactive</em> instead.
        </p>
      </Modal>
    </>
  );
}
