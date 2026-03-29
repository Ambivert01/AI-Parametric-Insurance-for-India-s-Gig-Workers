// AdminClaimsPage.jsx
import { useEffect, useState } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

export function AdminClaimsPage() {
  const [claims, setClaims] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [reviewNote, setReviewNote] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getClaims({ page, limit: 20, ...(status ? { status } : {}) });
      setClaims(res.data.data || []);
      setTotal(res.data.meta?.pagination?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, status]);

  const handleReview = async (claimId, decision) => {
    try {
      await adminAPI.reviewClaim(claimId, decision, reviewNote);
      toast.success(`Claim ${decision === 'approve' ? '✅ Approved' : '❌ Rejected'}`);
      setReviewing(null);
      setReviewNote('');
      load();
    } catch { toast.error('Review failed'); }
  };

  const STATUS_COLORS = {
    payout_completed: 'var(--green-400)', approved: 'var(--green-400)',
    fraud_screening: 'var(--amber-400)', pending_verification: 'var(--orange-400)',
    rejected: 'var(--red-400)', detected: 'var(--text-muted)',
  };

  const STATUSES = ['','fraud_screening','pending_verification','approved','rejected','payout_completed'];

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <h1>Claims Management</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{total} total</span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--s2)', marginBottom: 'var(--s5)', flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.8125rem', textTransform: 'capitalize' }}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 'var(--s12)' }}><div className="spinner" style={{ margin: 'auto', width: 32, height: 32 }} /></div> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Claim ID</th><th>Rider</th><th>City</th><th>Trigger</th>
                  <th>Amount</th><th>Fraud Score</th><th>Status</th><th>Time</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map(claim => (
                  <>
                    <tr key={claim._id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{claim.claimId}</td>
                      <td style={{ color: 'var(--text-primary)' }}>{claim.riderId?.name || '—'}</td>
                      <td>{claim.cityId}</td>
                      <td style={{ color: 'var(--orange-400)' }}>{claim.triggerType?.replace(/_/g,' ')}</td>
                      <td style={{ color: 'var(--green-400)', fontWeight: 700 }}>₹{claim.finalPayoutInr || 0}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                          <div style={{ width: 40, height: 5, background: 'var(--bg-secondary)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${claim.mlFraudScore || claim.fraudCheck?.score || 0}%`, background: (claim.mlFraudScore || claim.fraudCheck?.score || 0) > 70 ? 'var(--red-500)' : (claim.mlFraudScore || claim.fraudCheck?.score || 0) > 40 ? 'var(--amber-500)' : 'var(--green-500)', borderRadius: 'var(--r-full)' }} />
                          </div>
                          <span style={{ fontSize: '0.8125rem' }}>{claim.fraudCheck?.score || 0}</span>
                        </div>
                      </td>
                      <td><span style={{ color: STATUS_COLORS[claim.status] || 'var(--text-muted)', fontWeight: 600, fontSize: '0.8125rem' }}>{claim.status?.replace(/_/g,' ')}</span></td>
                      <td style={{ fontSize: '0.75rem' }}>{dayjs(claim.detectedAt).format('D MMM HH:mm')}</td>
                      <td>
                        {['pending_verification','fraud_screening'].includes(claim.status) && (
                          <button className="btn btn-sm btn-ghost" onClick={() => setReviewing(reviewing === claim._id ? null : claim._id)} style={{ fontSize: '0.75rem' }}>
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                    {reviewing === claim._id && (
                      <tr>
                        <td colSpan={9} style={{ background: 'rgba(255,107,43,0.06)', padding: 'var(--s4)' }}>
                          <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
                            <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Review note (optional)..." className="form-input" style={{ flex: 1, padding: '8px 12px', fontSize: '0.875rem' }} />
                            <button className="btn btn-success btn-sm" onClick={() => handleReview(claim._id, 'approve')}>✅ Approve</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleReview(claim._id, 'reject')}>❌ Reject</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          {total > 20 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--s2)', padding: 'var(--s4)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>← Prev</button>
              <span style={{ padding: '10px var(--s3)', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Page {page} of {Math.ceil(total/20)}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p=>p+1)} disabled={page>=Math.ceil(total/20)}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// AdminRidersPage.jsx
export function AdminRidersPage() {
  const [riders, setRiders] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [blocking, setBlocking] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      adminAPI.getUsers({ search, limit: 20 }).then(r => setRiders(r.data.data || [])).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const toggleBlock = async (rider) => {
    setBlocking(rider._id);
    try {
      await adminAPI.blockUser(rider._id, !rider.isBlocked, !rider.isBlocked ? 'Admin action' : '');
      setRiders(prev => prev.map(r => r._id === rider._id ? { ...r, isBlocked: !rider.isBlocked } : r));
      toast.success(rider.isBlocked ? 'Rider unblocked' : 'Rider blocked');
    } catch { toast.error('Action failed'); }
    finally { setBlocking(null); }
  };

  return (
    <div className="page-enter">
      <h1 style={{ marginBottom: 'var(--s5)' }}>Rider Management</h1>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="form-input" style={{ marginBottom: 'var(--s4)', maxWidth: 360 }} />

      {loading ? <div className="skeleton" style={{ height: 300, borderRadius: 'var(--r-lg)' }} /> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Platform</th><th>Fraud Score</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {riders.map(rider => (
                <tr key={rider._id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{rider.name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{rider.phone}</td>
                  <td>{rider.riderProfile?.cityId || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{rider.riderProfile?.platform || '—'}</td>
                  <td>
                    <span style={{ color: (rider.fraudScore||0) > 70 ? 'var(--red-400)' : (rider.fraudScore||0) > 40 ? 'var(--amber-400)' : 'var(--green-400)', fontWeight: 700 }}>
                      {rider.fraudScore || 0}
                    </span>
                  </td>
                  <td><span className={`badge ${rider.isBlocked ? 'badge-red' : rider.isActive ? 'badge-green' : 'badge-gray'}`}>{rider.isBlocked ? 'Blocked' : rider.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <button className={`btn btn-sm ${rider.isBlocked ? 'btn-ghost' : 'btn-danger'}`} style={{ fontSize: '0.75rem' }}
                      onClick={() => toggleBlock(rider)} disabled={blocking === rider._id}>
                      {blocking === rider._id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : rider.isBlocked ? 'Unblock' : 'Block'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// AdminFraudPage.jsx
export function AdminFraudPage() {
  const [logs, setLogs] = useState([]);
  const [tier, setTier] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getFraudLogs(1, tier || undefined).then(r => setLogs(r.data.data || [])).finally(() => setLoading(false));
  }, [tier]);

  const TIER_COLORS = { GREEN: 'var(--green-400)', YELLOW: 'var(--amber-400)', ORANGE: 'var(--orange-400)', RED: 'var(--red-400)' };

  return (
    <div className="page-enter">
      <h1 style={{ marginBottom: 'var(--s5)' }}>Fraud Intelligence</h1>
      <div style={{ display: 'flex', gap: 'var(--s2)', marginBottom: 'var(--s5)' }}>
        {['','GREEN','YELLOW','ORANGE','RED'].map(t => (
          <button key={t} onClick={() => setTier(t)} className={`btn btn-sm ${tier === t ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.8125rem' }}>
            {t || 'All Tiers'}
          </button>
        ))}
      </div>

      {loading ? <div className="skeleton" style={{ height: 300, borderRadius: 'var(--r-lg)' }} /> : (
        <div className="card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Score</th><th>Tier</th><th>City</th><th>Action</th><th>Time</th></tr></thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log._id || i}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{log.fraudType?.replace(/_/g,' ')}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                      <div style={{ width: 48, height: 6, background: 'var(--bg-secondary)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${log.score}%`, background: TIER_COLORS[log.tier] || 'var(--text-muted)', borderRadius: 'var(--r-full)' }} />
                      </div>
                      <span style={{ fontWeight: 700, color: TIER_COLORS[log.tier] }}>{log.score}</span>
                    </div>
                  </td>
                  <td><span className="badge" style={{ background: `${TIER_COLORS[log.tier]}22`, color: TIER_COLORS[log.tier] }}>{log.tier}</span></td>
                  <td>{log.details?.cityId || '—'}</td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{log.action?.replace(/_/g,' ')}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dayjs(log.createdAt).format('D MMM HH:mm')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// AdminMapPage.jsx
export function AdminMapPage() {
  const [heatmap, setHeatmap] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import('../../services/api').then(({ analyticsAPI }) =>
      analyticsAPI.getHeatmap().then(r => setHeatmap(r.data.data || [])).finally(() => setLoading(false))
    );
  }, []);

  const RISK_CONFIG = {
    high: { color: 'var(--red-400)', bg: 'rgba(239,68,68,0.12)', bar: '#EF4444' },
    medium: { color: 'var(--amber-400)', bg: 'rgba(245,158,11,0.12)', bar: '#F59E0B' },
    low: { color: 'var(--green-400)', bg: 'rgba(0,196,140,0.12)', bar: '#00C48C' },
  };

  return (
    <div className="page-enter">
      <h1 style={{ marginBottom: 'var(--s3)' }}>Risk Heatmap</h1>
      <p style={{ marginBottom: 'var(--s6)', fontSize: '0.875rem' }}>Real-time city risk scores based on weather, AQI, and historical claims.</p>

      {loading ? <div className="skeleton" style={{ height: 400, borderRadius: 'var(--r-xl)' }} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--s4)' }}>
          {heatmap.map(city => {
            const rc = RISK_CONFIG[city.riskLevel] || RISK_CONFIG.low;
            return (
              <div key={city.cityId} style={{ background: rc.bg, border: `1px solid ${rc.color}33`, borderRadius: 'var(--r-lg)', padding: 'var(--s5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--s3)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{city.name || city.cityId}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, color: rc.color, fontSize: '1.25rem' }}>{Math.round(city.riskScore)}</div>
                </div>
                <div className="progress-bar" style={{ marginBottom: 'var(--s3)' }}>
                  <div style={{ height: '100%', width: `${city.riskScore}%`, background: rc.bar, borderRadius: 'var(--r-full)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  <span>{city.activePolicies} policies</span>
                  <span style={{ color: rc.color, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>{city.riskLevel}</span>
                </div>
                {city.currentWeather?.rainfall3h > 0 && (
                  <div style={{ marginTop: 'var(--s2)', fontSize: '0.75rem', color: 'var(--navy-400)' }}>🌧️ Rain: {city.currentWeather.rainfall3h}mm</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// AdminPoolPage.jsx
export function AdminPoolPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import('../../services/api').then(({ adminAPI }) =>
      adminAPI.getLoyaltyPool().then(r => setData(r.data.data)).finally(() => setLoading(false))
    );
  }, []);

  return (
    <div className="page-enter">
      <h1 style={{ marginBottom: 'var(--s5)' }}>Community Loyalty Pool</h1>
      {loading ? <div className="skeleton" style={{ height: 300, borderRadius: 'var(--r-xl)' }} /> : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
          <div className="grid-2">
            <div className="stat-card">
              <span className="stat-label">Total Contributed (All Time)</span>
              <div className="stat-value" style={{ color: 'var(--green-400)' }}>₹{(data.allTime?.totalContrib||0).toLocaleString('en-IN')}</div>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total Disbursed (All Time)</span>
              <div className="stat-value" style={{ color: 'var(--orange-400)' }}>₹{(data.allTime?.totalDisbursed||0).toLocaleString('en-IN')}</div>
            </div>
          </div>
          <div className="card">
            <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s4)' }}>Weekly History</h3>
            <table className="data-table">
              <thead><tr><th>Week</th><th>Balance</th><th>Contributions</th><th>Disbursed</th><th>Carry Forward</th><th>Status</th></tr></thead>
              <tbody>
                {(data.pools || []).map(pool => (
                  <tr key={pool._id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pool.weekId}</td>
                    <td style={{ color: 'var(--green-400)', fontWeight: 700 }}>₹{pool.balanceInr?.toLocaleString('en-IN')}</td>
                    <td>₹{pool.contributionsInr?.toLocaleString('en-IN')} ({pool.contributors})</td>
                    <td style={{ color: 'var(--orange-400)' }}>₹{pool.disbursedInr?.toLocaleString('en-IN')}</td>
                    <td>₹{pool.carryForwardInr?.toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${pool.isClosed ? 'badge-gray' : 'badge-green'}`}>{pool.isClosed ? 'Closed' : 'Open'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <p style={{ color: 'var(--text-muted)' }}>No pool data available yet.</p>}
    </div>
  );
}

// Re-exports for lazy loading
export { AdminClaimsPage as default };