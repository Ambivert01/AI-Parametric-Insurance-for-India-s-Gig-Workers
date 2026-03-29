import { useEffect, useState } from 'react';
import { communityAPI } from '../../services/api';
import { useSelector } from 'react-redux';
import { selectUser } from '../../store/index';
import Icons from '../../components/shared/Icons';

export default function CommunityPage() {
  const user = useSelector(selectUser);
  const [stats, setStats] = useState(null);
  const [pool, setPool] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      communityAPI.getStats(user?.riderProfile?.cityId).then(r => setStats(r.data.data)),
      communityAPI.getPool().then(r => setPool(r.data.data)),
      communityAPI.getLeaderboard().then(r => setLeaderboard(r.data.data || [])),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s16)' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      <h1>Community</h1>

      {/* Zone stats */}
      {stats && (
        <div style={{ background: 'linear-gradient(135deg,var(--navy-700),var(--navy-600))', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-xl)', padding: 'var(--s6)' }}>
          <h3 style={{ marginBottom: 'var(--s5)' }}>Your Zone — {user?.riderProfile?.cityId}</h3>
          <div className="grid-2" style={{ marginBottom: 'var(--s4)' }}>
            {[
              { label: 'Riders Protected', val: stats.activePoliciesInZone },
              { label: 'Claims This Week', val: stats.weeklyClaimsCount },
              { label: 'Monthly Payouts', val: `₹${((stats.totalMonthlyProtectedInr||0)/1000).toFixed(1)}K` },
              { label: 'Claims Count', val: stats.totalMonthlyClaimsCount },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--r-md)', padding: 'var(--s3) var(--s4)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{item.val}</div>
              </div>
            ))}
          </div>
          {stats.socialProofMessage && <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', padding: 'var(--s3)', background: 'rgba(255,107,43,0.1)', borderRadius: 'var(--r-md)' }}>👥 {stats.socialProofMessage}</p>}
        </div>
      )}

      {/* Loyalty Pool */}
      {pool && (
        <div style={{ background: 'rgba(0,196,140,0.06)', border: '1px solid rgba(0,196,140,0.2)', borderRadius: 'var(--r-xl)', padding: 'var(--s6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--s4)' }}>
            <div>
              <h3 style={{ color: 'var(--green-400)', marginBottom: 4 }}>🌊 Community Pool</h3>
              <p style={{ fontSize: '0.875rem' }}>Week {pool.currentWeek?.weekId}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', color: 'var(--green-400)', lineHeight: 1 }}>
                ₹{(pool.currentWeek?.balanceInr || 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>available</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s3)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pool.currentWeek?.contributionsCount || 0}</div>
              <div>Contributors</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{pool.allTime?.totalDisbursedInr?.toLocaleString('en-IN') || 0}</div>
              <div>All-time disbursed</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pool.allTime?.totalWeeks || 0}</div>
              <div>Weeks active</div>
            </div>
          </div>
          <p style={{ fontSize: '0.8125rem', marginTop: 'var(--s4)', color: 'var(--text-muted)' }}>
            10% of unclaimed premiums fund this pool. During major events, riders receive bonus payouts above their base coverage.
          </p>
        </div>
      )}

      {/* Leaderboard */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s4)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <Icons.Award size={18} color="var(--amber-400)" /> Safe Week Leaderboard
        </h3>
        {leaderboard.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--s8)' }}>Be the first on the leaderboard!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
            {leaderboard.slice(0, 10).map((rider, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: i < 3 ? 'rgba(245,158,11,0.06)' : 'transparent', border: i < 3 ? '1px solid rgba(245,158,11,0.15)' : '1px solid transparent' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? 'var(--amber-500)' : i === 1 ? 'var(--gray-400)' : i === 2 ? '#CD7F32' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.875rem', color: i < 3 ? 'white' : 'var(--text-muted)', flexShrink: 0 }}>
                  {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rider.displayName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{rider.loyaltyTier?.replace('_',' ')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--orange-400)' }}>{rider.safeWeekStreak}w 🔥</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
