import React, { useState, useEffect } from 'react';
import api from '../api';

const STATUS_COLORS = { answered: '#22c55e', missed: '#ef4444', abandoned: '#f59e0b', ringing: '#3b82f6' };
const STATUS_LABELS = { answered: 'Cavablandı', missed: 'Buraxıldı', abandoned: 'Tərk edildi', ringing: 'Zəng gedir' };

function formatDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('az-AZ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

export default function CallsPage() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', page: 1 });

  const fetch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: filters.page, limit: 25 });
      if (filters.status) params.set('status', filters.status);
      const { data } = await api.get(`/tenants/calls?${params}`);
      setCalls(data.calls || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [filters]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.heading}>📞 Zəng Tarixi</h1>
        <div style={styles.filters}>
          <select
            value={filters.status}
            onChange={e => setFilters({ ...filters, status: e.target.value, page: 1 })}
            style={styles.select}
          >
            <option value="">Bütün statuslar</option>
            <option value="answered">Cavablandı</option>
            <option value="missed">Buraxıldı</option>
            <option value="abandoned">Tərk edildi</option>
          </select>
          <button style={styles.btnRefresh} onClick={fetch}>🔄 Yenilə</button>
        </div>
      </div>

      <div style={styles.table}>
        <div style={styles.thead}>
          <span>Zəng edən</span>
          <span>Operator</span>
          <span>Tarix</span>
          <span>Müddət</span>
          <span>Gözləmə</span>
          <span>Növ</span>
          <span>Status</span>
          <span>Qeyd</span>
        </div>

        {loading ? (
          <div style={styles.empty}>Yüklənir...</div>
        ) : calls.length === 0 ? (
          <div style={styles.empty}>Heç bir zəng tapılmadı</div>
        ) : calls.map(call => (
          <div key={call.id} style={styles.row}>
            <span style={styles.caller}>{call.caller_number}</span>
            <span style={styles.agent}>{call.agent_name || '—'}</span>
            <span style={styles.time}>{formatTime(call.started_at)}</span>
            <span style={styles.duration}>{formatDuration(call.duration_seconds)}</span>
            <span style={styles.wait}>{call.wait_time_seconds ? `${call.wait_time_seconds}s` : '—'}</span>
            <span style={{ ...styles.typeBadge, background: call.call_type === 'gsm' ? '#1e3a5f' : '#1e1b4b' }}>
              {call.call_type?.toUpperCase() || '—'}
            </span>
            <span style={{ ...styles.statusBadge, background: STATUS_COLORS[call.status] || '#64748b' }}>
              {STATUS_LABELS[call.status] || call.status}
            </span>
            <span style={styles.notes}>{call.notes || '—'}</span>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div style={styles.pagination}>
        <button
          style={styles.pageBtn}
          onClick={() => setFilters(f => ({ ...f, page: Math.max(1, f.page - 1) }))}
          disabled={filters.page === 1}
        >← Əvvəl</button>
        <span style={styles.pageNum}>Səhifə {filters.page}</span>
        <button
          style={styles.pageBtn}
          onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
          disabled={calls.length < 25}
        >Sonra →</button>
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  heading: { color: '#e2e8f0', fontSize: 24, fontWeight: 700 },
  filters: { display: 'flex', gap: 10, alignItems: 'center' },
  select: { background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: 'pointer' },
  btnRefresh: { background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' },
  table: { background: '#1e293b', borderRadius: 12, overflow: 'hidden' },
  thead: { display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1.5fr 0.8fr 0.8fr 0.6fr 1fr 1fr', padding: '12px 16px', background: '#0f172a', color: '#64748b', fontSize: 11, fontWeight: 600, gap: 8, textTransform: 'uppercase' },
  row: { display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1.5fr 0.8fr 0.8fr 0.6fr 1fr 1fr', padding: '12px 16px', borderBottom: '1px solid #0f172a', alignItems: 'center', gap: 8 },
  caller: { color: '#e2e8f0', fontSize: 14, fontWeight: 500 },
  agent: { color: '#94a3b8', fontSize: 13 },
  time: { color: '#94a3b8', fontSize: 12 },
  duration: { color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace' },
  wait: { color: '#64748b', fontSize: 12 },
  typeBadge: { padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#93c5fd', width: 'fit-content' },
  statusBadge: { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff', width: 'fit-content' },
  notes: { color: '#64748b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: { color: '#64748b', textAlign: 'center', padding: '40px 0', fontSize: 14 },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' },
  pageNum: { color: '#94a3b8', fontSize: 14 },
};
