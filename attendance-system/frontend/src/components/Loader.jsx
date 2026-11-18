export default function Loader({ full, label = 'Loading…' }) {
  return (
    <div className={full ? 'loader loader-full' : 'loader'}>
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}
