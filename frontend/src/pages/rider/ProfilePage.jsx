import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { selectUser, authActions } from '../../store/index';
import { kycAPI, notifAPI, referralAPI, authAPI } from '../../services/api';
import Icons from '../../components/shared/Icons';

export default function ProfilePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const [tab, setTab] = useState('profile');
  const [kycStatus, setKycStatus] = useState(null);
  const [referral, setReferral] = useState(null);
  const [referralCode, setReferralCode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [notifPrefs, setNotifPrefs] = useState({ whatsapp: true, sms: true, push: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadKYC();
    loadReferral();
  }, []);

  const loadKYC = async () => {
    try {
      const res = await kycAPI.getStatus();
      setKycStatus(res.data.data);
      setNotifPrefs(user?.notificationPrefs || { whatsapp: true, sms: true, push: true });
    } catch {}
  };

  const loadReferral = async () => {
    try {
      const res = await referralAPI.getStats();
      setReferral(res.data.data);
    } catch {}
  };

  const verifyUPI = async () => {
    if (!upiId.includes('@')) return toast.error('Enter a valid UPI ID (e.g. 9876543210@upi)');
    setLoading(true);
    try {
      await kycAPI.verifyBank(upiId);
      toast.success('✅ UPI verified! You can now receive payouts.');
      loadKYC();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Verification failed'); }
    finally { setLoading(false); }
  };

  const applyReferral = async () => {
    if (!referralCode.trim()) return;
    setLoading(true);
    try {
      const res = await referralAPI.apply(referralCode.trim().toUpperCase());
      toast.success(`🎉 Referral applied! ₹${res.data.data.creditEarnedInr} credited to your wallet.`);
      setReferralCode('');
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Invalid referral code'); }
    finally { setLoading(false); }
  };

  const saveNotifPrefs = async () => {
    try {
      await notifAPI.updatePrefs(notifPrefs);
      toast.success('Notification preferences saved');
    } catch { toast.error('Failed to save'); }
  };

  const handleLogout = async () => {
    try { await authAPI.logout(); } catch {}
    dispatch(authActions.logout());
    navigate('/auth');
  };

  const KYCStep = ({ done, label, desc, action }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--s4)', background: done ? 'rgba(0,196,140,0.06)' : 'var(--bg-secondary)', borderRadius: 'var(--r-md)', border: `1px solid ${done ? 'rgba(0,196,140,0.2)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: done ? 'var(--green-500)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: done ? '1rem' : '0.875rem', color: done ? 'white' : 'var(--text-muted)', flexShrink: 0 }}>
          {done ? '✓' : '?'}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: done ? 'var(--green-400)' : 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{desc}</div>
        </div>
      </div>
      {!done && action}
    </div>
  );

  return (
    <div className="page-enter">
      <h1 style={{ marginBottom: 'var(--s5)' }}>Profile & Settings</h1>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 'var(--s2)', marginBottom: 'var(--s6)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--s3)' }}>
        {[['profile','Profile'],['kyc','KYC & Bank'],['notifications','Alerts'],['referral','Referral']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem', color: tab === t ? 'var(--orange-400)' : 'var(--text-muted)', borderBottom: `2px solid ${tab === t ? 'var(--orange-500)' : 'transparent'}`, paddingBottom: 'var(--s3)', marginBottom: -13, transition: 'color var(--t-fast)' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ─── Profile Tab ──────────────────────────────────── */}
      {tab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s5)', padding: 'var(--s5)', background: 'var(--bg-card)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border)' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--orange-500), var(--orange-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', color: 'white', flexShrink: 0 }}>
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>{user?.name}</h2>
              <p style={{ fontSize: '0.875rem', marginBottom: 4 }}>+91 {user?.phone}</p>
              <div style={{ display: 'flex', gap: 'var(--s2)' }}>
                <span className="badge badge-orange" style={{ textTransform: 'capitalize' }}>{user?.riderProfile?.platform}</span>
                <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{user?.riderProfile?.cityId}</span>
              </div>
            </div>
          </div>

          {/* Rider info */}
          <div className="card">
            <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s4)' }}>Rider Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              {[
                { label: 'Platform', val: user?.riderProfile?.platform },
                { label: 'Vehicle', val: user?.riderProfile?.vehicleType },
                { label: 'Shift', val: user?.riderProfile?.shiftPattern },
                { label: 'Daily Income', val: `₹${user?.riderProfile?.declaredDailyIncome}` },
                { label: 'Referral Code', val: user?.referralCode, mono: true },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--s3) 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{item.label}</span>
                  <span style={{ fontWeight: 600, fontFamily: item.mono ? 'monospace' : 'inherit', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{item.val || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Loyalty */}
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(255,107,43,0.05))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s3)' }}>
              <h3 style={{ fontSize: '0.9375rem' }}>Loyalty Status</h3>
              <span style={{ fontSize: '1.5rem' }}>{user?.loyaltyTier === 'gold_rider' ? '🥇' : user?.loyaltyTier === 'silver_rider' ? '🥈' : '🛵'}</span>
            </div>
            <div className="grid-2">
              <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Streak</div><div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{user?.safeWeekStreak || 0} weeks 🔥</div></div>
              <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Discount</div><div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--green-400)' }}>{Math.round((user?.loyaltyDiscount || 0) * 100)}%</div></div>
              <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wallet</div><div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--orange-400)' }}>₹{user?.walletBalance || 0}</div></div>
              <div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tier</div><div style={{ fontWeight: 700, fontSize: '1.125rem', textTransform: 'capitalize' }}>{(user?.loyaltyTier || 'none').replace('_', ' ')}</div></div>
            </div>
          </div>

          <button className="btn btn-danger btn-full" onClick={handleLogout}>
            <Icons.LogOut size={18} /> Sign Out
          </button>
        </div>
      )}

      {/* ─── KYC Tab ──────────────────────────────────────── */}
      {tab === 'kyc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
          <div className="alert-banner info">
            <Icons.Shield size={18} />
            <div>
              <strong>Complete KYC to receive payouts</strong>
              <p style={{ marginTop: 4, fontSize: '0.8125rem' }}>Phone + Bank verification required. Aadhaar is optional but builds trust score.</p>
            </div>
          </div>

          <KYCStep done={true} label="Phone Verified" desc={`+91 ${user?.phone}`} />

          <KYCStep done={kycStatus?.steps?.bank} label="UPI / Bank Account"
            desc={kycStatus?.steps?.bank ? 'Payment account verified ✓' : 'Required for receiving payouts'}
            action={
              <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="9876543210@upi" className="form-input" style={{ width: 180, padding: '8px 12px', fontSize: '0.875rem' }} />
                <button className="btn btn-primary btn-sm" onClick={verifyUPI} disabled={loading}>Verify</button>
              </div>
            }
          />

          <KYCStep done={kycStatus?.steps?.selfie} label="Selfie / Liveness"
            desc={kycStatus?.steps?.selfie ? `Score: ${kycStatus.livenessScore}/100` : 'Optional — increases trust score'}
            action={<button className="btn btn-ghost btn-sm">Upload →</button>}
          />

          <KYCStep done={kycStatus?.steps?.aadhaar} label="Aadhaar Verification"
            desc={kycStatus?.steps?.aadhaar ? `Last 4: ****${kycStatus.aadhaarLast4}` : 'Optional — boosts fraud score positively'}
            action={
              <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                <input value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g,'').slice(0,12))} placeholder="12-digit Aadhaar" className="form-input" style={{ width: 160, padding: '8px 12px', fontSize: '0.875rem' }} maxLength={12} />
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  if (aadhaar.length !== 12) return toast.error('Enter 12-digit Aadhaar');
                  try { await kycAPI.verifyAadhaar(aadhaar); toast.success('Aadhaar verified!'); loadKYC(); }
                  catch (err) { toast.error(err.response?.data?.error?.message || 'Failed'); }
                }}>Verify</button>
              </div>
            }
          />

          {kycStatus && (
            <div style={{ padding: 'var(--s4)', background: 'var(--bg-card)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', color: 'var(--orange-400)', marginBottom: 4 }}>
                {kycStatus.completedSteps}/{kycStatus.totalSteps}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>KYC steps complete</div>
              <div className="progress-bar" style={{ marginTop: 'var(--s3)' }}>
                <div className="progress-fill" style={{ width: `${(kycStatus.completedSteps/kycStatus.totalSteps)*100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Notifications Tab ────────────────────────────── */}
      {tab === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Choose how GigShield reaches you for claims, payouts, and alerts.</p>

          {[
            { key: 'whatsapp', label: 'WhatsApp', desc: 'Claim updates, payout credits, zone alerts', icon: '💬' },
            { key: 'sms', label: 'SMS', desc: 'Backup if WhatsApp fails', icon: '📱' },
            { key: 'push', label: 'Push Notifications', desc: 'Real-time alerts on your phone', icon: '🔔' },
          ].map(opt => (
            <div key={opt.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--s4) var(--s5)', background: 'var(--bg-card)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
                <span style={{ fontSize: '1.5rem' }}>{opt.icon}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
                </div>
              </div>
              <button onClick={() => setNotifPrefs(p => ({...p, [opt.key]: !p[opt.key]}))} style={{
                width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: notifPrefs[opt.key] ? 'var(--green-500)' : 'var(--bg-elevated)',
                position: 'relative', transition: 'background var(--t-base)',
              }}>
                <div style={{ position: 'absolute', top: 3, left: notifPrefs[opt.key] ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left var(--t-spring)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
              </button>
            </div>
          ))}

          <button className="btn btn-primary btn-full" onClick={saveNotifPrefs}>Save Preferences</button>
        </div>
      )}

      {/* ─── Referral Tab ─────────────────────────────────── */}
      {tab === 'referral' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
          {/* My code */}
          <div style={{ background: 'linear-gradient(135deg, rgba(255,107,43,0.12), rgba(255,107,43,0.05))', border: '1px solid rgba(255,107,43,0.3)', borderRadius: 'var(--r-xl)', padding: 'var(--s6)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--s3)' }}>Your Referral Code</div>
            <div style={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 900, color: 'var(--orange-400)', letterSpacing: '0.2em', marginBottom: 'var(--s3)' }}>
              {user?.referralCode || 'GS-XXXXXX'}
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => {
              navigator.clipboard?.writeText(user?.referralCode || '');
              toast.success('Code copied!');
            }}>
              📋 Copy Code
            </button>
            <p style={{ fontSize: '0.8125rem', marginTop: 'var(--s3)' }}>
              You and your friend both get <strong style={{ color: 'var(--orange-400)' }}>₹20</strong> when they activate their first policy
            </p>
          </div>

          {/* Stats */}
          {referral && (
            <div className="grid-2">
              <div className="stat-card">
                <span className="stat-label">Friends Referred</span>
                <div className="stat-value" style={{ color: 'var(--orange-400)', fontSize: '1.625rem' }}>{referral.referralCount}</div>
              </div>
              <div className="stat-card">
                <span className="stat-label">Credits Earned</span>
                <div className="stat-value" style={{ color: 'var(--green-400)', fontSize: '1.625rem' }}>₹{referral.totalCreditsEarnedInr}</div>
              </div>
            </div>
          )}

          {/* Apply friend's code */}
          <div className="card">
            <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s3)' }}>Apply a Friend's Code</h3>
            <div style={{ display: 'flex', gap: 'var(--s3)' }}>
              <input value={referralCode} onChange={e => setReferralCode(e.target.value.toUpperCase())} placeholder="GS-XXXXXX" className="form-input" style={{ flex: 1, textTransform: 'uppercase', fontFamily: 'monospace' }} />
              <button className="btn btn-primary" onClick={applyReferral} disabled={loading || !referralCode}>
                {loading ? <div className="spinner" style={{ width: 16, height: 16, borderTopColor: 'white' }} /> : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
