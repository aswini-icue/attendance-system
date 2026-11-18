import { useEffect } from 'react';
import { X, Inbox } from 'lucide-react';
import { initials } from '../utils/format';

export function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-muted">Not marked</span>;
  const cls = status.toLowerCase().replace(/[^a-z]/g, '');
  return <span className={`badge badge-${cls}`}>{status === 'Half-day' ? 'Half Day' : status}</span>;
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon tone-${tone}`}>{Icon && <Icon size={20} />}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 34, brand = false }) {
  return (
    <span className={brand ? 'avatar avatar-brand' : 'avatar'} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

export function PersonCell({ name, sub }) {
  return (
    <div className="person">
      <Avatar name={name} />
      <div>
        <div className="person-name">{name}</div>
        {sub && <div className="person-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', text }) {
  return (
    <div className="empty">
      <Inbox size={36} />
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
