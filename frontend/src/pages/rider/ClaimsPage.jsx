// ClaimsPage.jsx — List all claims with filtering
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { claimsAPI } from '../../services/api';
import Icons from '../../components/shared/Icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const STATUS_CONFIG = {
  payout_completed:   { label: 'Paid', color: 'var(--green-400)', icon: '✅' },
  approved:           { label: 'Approved', color: 'var(--green-400)', icon: '✅' },
  fraud_screening:    { label: 'Screening', color: 'var(--amber-400)', icon: '⚙️' },
  pending_verification:{ label: 'Verify', color: 'var(--orange-400)', icon: '📸' },
  rejected:           { label: 'Rejected', color: 'var(--red-400)', icon: '❌' },
  appeal_pending:     { label: 'Appeal', color: 'var(--amber-400)', icon: '⏳' },
  appeal_approved:    { label: 'Appealed ✓', color: 'var(--green-400)', icon: '✅' },
  payout_initiated:   { label: 'Sending...', color: 'var(--blue-400)', icon: '💸' },
  detected:           { label: 'Detected', color: 'var(--text-muted)', icon: '🔍' },
};

const TRIGGER_ICONS = {
  HEAVY_RAIN: '🌧️', AQI_SPIKE: '😷', EXTREME_HEAT: '🌡️',
  CURFEW: '🚫', PLATFORM_OUTAGE: '📵', CYCLONE: '🌀', BANDH: '🚧',
};

export default function ClaimsPage() {
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const FILTERS = ['all','payout_completed','pending_verification','rejected'];

  useEffect(() => {
    loadClaims();
  }, [page]);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const res = await claimsAPI.getAll(page, 15);
      setClaims(res.data.data || []);
      setTotal(res.data.meta?.pagination?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  const filtered = filter === 'all' ? claims : claims.filter(c => c.status === filter);
  const totalPayouts = claims.filter(c => c.status === 'payout_completed').reduce((sum, c) => sum + (c.finalPayoutInr || 0), 0);

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div>
          <h1>My Claims</h1>
          <p style={{ fontSize: '0.875rem' }}>{total} total • ₹{totalPayouts.toLocaleString('en-IN')} received</p>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 'var(--s2)', marginBottom: 'var(--s5)', overflowX: 'auto', paddingBottom: 4 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={{ whiteSpace: 'nowrap', textTransform: 'capitalize', fontSize: '0.8125rem' }}>
            {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label || f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 88, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--s16)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s4)' }}>
          <Icons.FileText size={56} color="var(--text-muted)" />
          <div>
            <h3 style={{ marginBottom: 'var(--s2)' }}>No claims yet</h3>
            <p style={{ fontSize: '0.875rem' }}>Claims are auto-triggered when disruptions occur in your zone</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            {filtered.map(claim => {
              const sc = STATUS_CONFIG[claim.status] || { label: claim.status, color: 'var(--text-muted)', icon: '❓' };
              const triggerIcon = TRIGGER_ICONS[claim.triggerType] || '⚡';
              const fraudTier = claim.fraudCheck?.tier;
              return (
                <div key={claim._id} onClick={() => navigate(`/claims/${claim._id}`)} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)', padding: 'var(--s4) var(--s5)',
                  cursor: 'pointer', transition: 'all var(--t-fast)',
                }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.75rem', lineHeight: 1, marginTop: 2 }}>{triggerIcon}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                          {claim.triggerType?.replace(/_/g, ' ')} — {claim.cityId}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', gap: 'var(--s3)' }}>
                          <span>{dayjs(claim.detectedAt).fromNow()}</span>
                          {claim.totalProcessingMs && <span>⚡ {Math.round(claim.totalProcessingMs / 60000)}min processing</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--s2)' }}>
                      {claim.finalPayoutInr > 0 && (
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--green-400)', fontSize: '1.125rem' }}>
                          +₹{claim.finalPayoutInr}
                        </span>
                      )}
                      <span style={{ padding: '3px 10px', borderRadius: 'var(--r-full)', background: `${sc.color}22`, color: sc.color, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {sc.icon} {sc.label}
                      </span>
                      {fraudTier && <span className={`badge badge-${fraudTier === 'GREEN' ? 'green' : fraudTier === 'RED' ? 'red' : 'amber'}`} style={{ fontSize: '0.625rem' }}>
                        {fraudTier}
                      </span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > 15 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--s2)', marginTop: 'var(--s6)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page === 1}>← Prev</button>
              <span style={{ padding: '10px var(--s4)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Page {page} of {Math.ceil(total/15)}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/15)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
