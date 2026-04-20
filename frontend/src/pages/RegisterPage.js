import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: '', ownerName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.businessName, form.ownerName, form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Qeydiyyat uğursuz oldu');
    } finally {
      setLoading(false);
    }
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>📞 CallCenter AZ</div>
        <h2 style={styles.title}>Qeydiyyat</h2>
        <p style={styles.subtitle}>14 günlük pulsuz sınaq dövrü</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {[
            { key: 'businessName', label: 'Biznes adı', placeholder: 'Restoran Firuzə' },
            { key: 'ownerName',    label: 'Adınız',     placeholder: 'Əli Əliyev' },
            { key: 'email',        label: 'Email',      placeholder: 'admin@restoran.az', type: 'email' },
            { key: 'password',     label: 'Şifrə',      placeholder: '••••••••',         type: 'password' },
          ].map(f => (
            <div key={f.key} style={styles.field}>
              <label style={styles.label}>{f.label}</label>
              <input
                type={f.type || 'text'}
                value={form[f.key]}
                onChange={set(f.key)}
                style={styles.input}
                placeholder={f.placeholder}
                required
              />
            </div>
          ))}
          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? 'Yaradılır...' : 'Hesab yarat'}
          </button>
        </form>

        <p style={styles.footer}>
          Hesabınız var? <Link to="/login" style={styles.link}>Daxil ol</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 20 },
  card: { background: '#1e293b', borderRadius: 16, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  logo: { fontSize: 24, fontWeight: 700, color: '#60a5fa', textAlign: 'center', marginBottom: 4 },
  title: { color: '#e2e8f0', textAlign: 'center', marginBottom: 4, fontWeight: 600, fontSize: 20 },
  subtitle: { color: '#22c55e', textAlign: 'center', fontSize: 13, marginBottom: 24 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: '#94a3b8', fontSize: 13, fontWeight: 500 },
  input: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none' },
  btn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  footer: { color: '#64748b', textAlign: 'center', marginTop: 20, fontSize: 14 },
  link: { color: '#60a5fa', textDecoration: 'none' },
};
