import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';
import { useSocket } from '../hooks/useSocket';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [activeCalls, setActiveCalls] = useState([]);
  const [agents, setAgents] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [notification, setNotification] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [s, ac, ag, an] = await Promise.all([
        api.get('/tenants/stats'),
        api.get('/calls/active'),
        api.get('/agents'),
        api.get('/calls/analytics/summary?days=7'),
      ]);
      setStats(s.data);
      setActiveCalls(ac.data);
      setAgents(ag.data);
      setAnalytics(an.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime socket events
  useSocket(useCallback((event) => {
    if (event.type === 'call:incoming') {
      setNotification({ msg: `📞 Yeni zəng: ${event.data.callerNumber}`, color: '#22c55e' });
      setTimeout(() => setNotification(null), 5000);
      fetchAll();
    } else if (['call:answered', 'call:ended', 'call:abandoned'].includes(event.type)) {
      fetchAll();
    } else if (event.type === 'agent:status:updated') {
      setAgents(prev => prev.map(a =>
        a.user_id === event.data.userId || a.id === event.data.agentId
          ? { ...a, status: event.data.status }
          : a
      ));
    }
  }, [fetchAll]));

  const statCards = stats ? [
    { label: 'Bugünkü zənglər',  value: stats.today.total,    icon: '📞', color: '#3b82f6' },
    { label: 'Cavablandırıldı',  value: stats.today.answered,  icon: '✅', color: '#22c55e' },
    { label: 'Buraxıldı',        value: stats.today.missed,    icon: '❌', color: '#ef4444' },
    { label: 'Ort. müddət (san)', value: stats.today.avgDuration, icon: '⏱', color: '#f59e0b' },
  ] : [];

  const statusColor = { online: '#22c55e', busy: '#f59e0b', paused: '#94a3b8', offline: '#64748b' };
  const statusLabel = { online: 'Onlayn', busy: 'Məşğul', paused: 'Fasilə', offline: 'Oflayn' };

  return (
    <div style={styles.page}>
      {notification && <div style={{ ...styles.notification, background: notification.color }}>{notification.msg}</div>}

      <h1 style={styles.heading}>Dashboard</h1>

      {/* Stat cards */}
      <div style={styles.grid4}>
        {statCards.map((c, i) => (
          <div key={i} style={{ ...styles.statCard, borderLeft: `4px solid ${c.color}` }}>
            <div style={styles.statIcon}>{c.icon}</div>
            <div>
              <div style={styles.statValue}>{c.value ?? '—'}</div>
              <div style={styles.statLabel}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Active calls + Agent list */}
      <div style={styles.grid2}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🔴 Aktiv Zənglər ({activeCalls.length})</h2>
          {activeCalls.length === 0
            ? <p style={styles.empty}>Hal-hazırda aktiv zəng yoxdur</p>
            : activeCalls.map(call => (
              <div key={call.id} style={styles.callRow}>
                <div>
                  <div style={styles.callNum}>{call.caller_number}</div>
                  <div style={styles.callMeta}>{call.agent_name ? `→ ${call.agent_name}` : 'Gözləyir...'}</div>
                </div>
                <div style={styles.callType}>{call.call_type?.toUpperCase()}</div>
              </div>
            ))
          }
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>👤 Operatorlar</h2>
          {agents.map(agent => (
            <div key={agent.id} style={styles.agentRow}>
              <div style={styles.avatar}>{agent.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={styles.agentName}>{agent.name}</div>
                <div style={styles.agentExt}>Ext: {agent.extension}</div>
              </div>
              <span style={{ ...styles.statusBadge, background: statusColor[agent.status] || '#64748b' }}>
                {statusLabel[agent.status] || agent.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>📈 Son 7 gün — Zəng statistikası</h2>
        {analytics.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={analytics}>
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
              <Line type="monotone" dataKey="total"    stroke="#3b82f6" strokeWidth={2} name="Ümumi" dot={false} />
              <Line type="monotone" dataKey="answered" stroke="#22c55e" strokeWidth={2} name="Cavablandı" dot={false} />
              <Line type="monotone" dataKey="missed"   stroke="#ef4444" strokeWidth={2} name="Buraxıldı" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p style={styles.empty}>Hələ məlumat yoxdur</p>}
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth: 1200, margin: '0 auto' },
  heading: { color: '#e2e8f0', fontSize: 24, fontWeight: 700, marginBottom: 24 },
  notification: { position: 'fixed', top: 20, right: 20, color: '#fff', padding: '12px 20px', borderRadius: 10, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  statCard: { background: '#1e293b', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 },
  statIcon: { fontSize: 28 },
  statValue: { color: '#e2e8f0', fontSize: 28, fontWeight: 700 },
  statLabel: { color: '#64748b', fontSize: 12, marginTop: 2 },
  card: { background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 16 },
  cardTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 16 },
  empty: { color: '#64748b', fontSize: 14, textAlign: 'center', padding: '20px 0' },
  callRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #334155' },
  callNum: { color: '#e2e8f0', fontWeight: 600, fontSize: 15 },
  callMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  callType: { background: '#1e3a5f', color: '#60a5fa', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 },
  agentRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #334155' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: '#fff', flexShrink: 0 },
  agentName: { color: '#e2e8f0', fontSize: 14, fontWeight: 500 },
  agentExt: { color: '#64748b', fontSize: 12 },
  statusBadge: { padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#fff' },
};
