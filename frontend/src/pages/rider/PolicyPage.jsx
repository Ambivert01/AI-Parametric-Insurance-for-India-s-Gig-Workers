import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectPolicy, selectUser, policyActions } from '../../store/index';
import { policyAPI } from '../../services/api';
import Icons from '../../components/shared/Icons';
import dayjs from 'dayjs';

const TIERS = [
  { id: 'BASIC',    emoji: '🔵', price: null, daily: 200,  weeklyMax: 800,   triggers: ['Rain', 'AQI'], color: '#3A7CB8' },
  { id: 'STANDARD', emoji: '🟠', price: null, daily: 350,  weeklyMax: 1400,  triggers: ['All 6 types'], color: '#FF6B2B', popular: true },
  { id: 'PRO',      emoji: '🟣', price: null, daily: 500,  weeklyMax: 2000,  triggers: ['All + App crash'], color: '#8B5CF6' },
  { id: 'ELITE',    emoji: '⭐', price: null, daily: 700,  weeklyMax: 2800,  triggers: ['All + Loan bridge'], color: '#F59E0B', best: true },
];

const STATUS_CONFIG = {
  active:          { label: 'Active', color: 'var(--green-400)', bg: 'rgba(0,196,140,0.1)' },
  pending_payment: { label: 'Pending', color: 'var(--amber-400)', bg: 'rgba(245,158,11,0.1)' },
  lapsed:          { label: 'Lapsed', color: 'var(--gray-400)', bg: 'rgba(100,116,139,0.1)' },
  expired:         { label: 'Expired', color: 'var(--gray-400)', bg: 'rgba(100,116,139,0.1)' },
  cancelled:       { label: 'Cancelled', color: 'var(--red-400)', bg: 'rgba(239,68,68,0.1)' },
};

export default function PolicyPage({ mode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const { activePolicy, policies } = useSelector(selectPolicy);

  const [tab, setTab] = useState(mode === 'buy' || params.get('renew') ? 'buy' : activePolicy ? 'active' : 'buy');
  const [quotes, setQuotes] = useState({});
  const [selectedTier, setSelectedTier] = useState('STANDARD');
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [autoRenew, setAutoRenew] = useState(activePolicy?.isAutoRenew || false);
  const [policyHistory, setPolicyHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // Per-shift state
  const [shiftQuotes, setShiftQuotes] = useState({});
  const [activeShift, setActiveShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);

  useEffect(() => {
    loadQuotes();
    loadHistory();
    loadShift();
  }, []);

  const loadQuotes = async () => {
    setLoadingQuotes(true);
    const tiers = ['BASIC','STANDARD','PRO','ELITE'];
    const results = {};
    await Promise.allSettled(
      tiers.map(async (tier) => {
        try {
          const res = await policyAPI.getQuote(tier);
          results[tier] = res.data.data;
        } catch {
          results[tier] = { premiumAmountInr: { BASIC:38, STANDARD:72, PRO:110, ELITE:148 }[tier] };
        }
      })
    );
    setQuotes(results);
    setLoadingQuotes(false);
  };

  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const res = await policyAPI.getHistory(1, 10);
      setPolicyHistory(res.data.data || []);
    } catch {} finally { setHistLoading(false); }
  };

  const loadShift = async () => {
    try {
      const res = await policyAPI.getActiveShift();
      setActiveShift(res.data.data);
    } catch {}
  };

  const handleBuyPolicy = async () => {
    if (activePolicy) {
      toast.error('You already have an active policy this week');
      return;
    }
    setPurchasing(true);
    try {
      const res = await policyAPI.create(selectedTier, autoRenew);
      const { policy, paymentOrder } = res.data.data;
      // In production: open Razorpay checkout
      // For demo: auto-confirm
      await policyAPI.confirmPayment(policy._id, `pay_mock_${Date.now()}`, 'mock_sig', paymentOrder.orderId);
      toast.success(`🛡️ ${selectedTier} Shield activated!`);
      const active = await policyAPI.getActive();
      dispatch(policyActions.setActivePolicy(active.data.data));
      setTab('active');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Purchase failed');
    } finally { setPurchasing(false); }
  };

  const handleActivateShift = async (tier) => {
    setShiftLoading(true);
    try {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        await policyAPI.activateShift(tier, latitude, longitude);
        toast.success(`⚡ ${tier} Shift Shield active for 6 hours!`);
        loadShift();
        setShiftLoading(false);
      }, () => {
        // Fallback: use city center
        policyAPI.activateShift(tier, 19.076, 72.877)
          .then(() => { toast.success(`⚡ ${tier} Shift Shield active!`); loadShift(); })
          .finally(() => setShiftLoading(false));
      });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to activate shift');
      setShiftLoading(false);
    }
  };

  const handleDeactivateShift = async () => {
    try {
      await policyAPI.deactivateShift();
      setActiveShift(null);
      toast.success('Shift coverage ended');
    } catch { toast.error('Failed to deactivate'); }
  };

  const handleAutoRenewToggle = async () => {
    const newVal = !autoRenew;
    try {
      await policyAPI.toggleAutoRenew(newVal);
      setAutoRenew(newVal);
      toast.success(newVal ? '🔄 Auto-renew enabled' : 'Auto-renew disabled');
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s6)' }}>
        <h1>My Shield</h1>
        <div style={{ display: 'flex', gap: 'var(--s2)' }}>
          {['active','buy','shift','history'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              style={{ textTransform: 'capitalize', fontSize: '0.8125rem' }}>
              {t === 'shift' ? '⚡ Shift' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Active Policy Tab ──────────────────────────── */}
      {tab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
          {activePolicy ? (
            <>
              <div style={{
                background: 'linear-gradient(135deg, var(--navy-700), var(--navy-600))',
                border: '1px solid var(--border-strong)', borderRadius: 'var(--r-xl)', padding: 'var(--s6)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--s5)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s2)' }}>
                      <div className="status-dot active" />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--green-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active This Week</span>
                    </div>
                    <h2 style={{ marginBottom: 4 }}>{activePolicy.tier} Shield</h2>
                    <p style={{ fontSize: '0.875rem' }}>Policy #{activePolicy.policyNumber}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 900, color: 'var(--orange-400)', lineHeight: 1 }}>
                      ₹{activePolicy.premiumAmountInr}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>this week</div>
                  </div>
                </div>

                <div className="grid-2" style={{ marginBottom: 'var(--s5)' }}>
                  {[
                    { label: 'Daily Coverage', val: `₹${activePolicy.tierDetails?.dailyCoverageInr}` },
                    { label: 'Weekly Max', val: `₹${activePolicy.tierDetails?.weeklyMaxInr?.toLocaleString('en-IN')}` },
                    { label: 'Period', val: `${dayjs(activePolicy.startDate).format('D MMM')} – ${dayjs(activePolicy.endDate).format('D MMM')}` },
                    { label: 'Claims', val: `${activePolicy.claimsCount || 0} this week` },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--r-md)', padding: 'var(--s3) var(--s4)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.val}</div>
                    </div>
                  ))}
                </div>

                {/* Remaining coverage bar */}
                <div style={{ marginBottom: 'var(--s5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 'var(--s2)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Coverage used</span>
                    <span style={{ fontWeight: 600 }}>₹{activePolicy.totalPayoutInr || 0} / ₹{activePolicy.tierDetails?.weeklyMaxInr}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${((activePolicy.totalPayoutInr || 0) / activePolicy.tierDetails?.weeklyMaxInr) * 100}%`,
                      background: 'linear-gradient(90deg, var(--orange-500), var(--orange-400))',
                    }} />
                  </div>
                </div>

                {/* Triggers covered */}
                <div style={{ marginBottom: 'var(--s5)' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--s2)' }}>Protected against:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s2)' }}>
                    {(activePolicy.tierDetails?.triggers || []).map(t => (
                      <span key={t} className="badge badge-orange" style={{ fontSize: '0.75rem' }}>
                        {t.replace(/_/g,' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Auto-renew toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--s4)', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--r-md)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Auto-Renew</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Automatically renew every Monday</div>
                  </div>
                  <button onClick={handleAutoRenewToggle} style={{
                    width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                    background: autoRenew ? 'var(--green-500)' : 'var(--bg-elevated)',
                    position: 'relative', transition: 'background var(--t-base)',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: autoRenew ? 25 : 3,
                      width: 20, height: 20, borderRadius: '50%', background: 'white',
                      transition: 'left var(--t-spring)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>

                {/* Blockchain link */}
                {activePolicy.blockchainTxHash && (
                  <div style={{ marginTop: 'var(--s4)', padding: 'var(--s3) var(--s4)', background: 'rgba(58,124,184,0.1)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                    <Icons.Link size={14} color="var(--navy-400)" />
                    <span style={{ fontSize: '0.8125rem', color: 'var(--navy-400)' }}>
                      On-chain: {activePolicy.blockchainTxHash.slice(0, 16)}...
                    </span>
                    <a href={`https://sepolia.etherscan.io/tx/${activePolicy.blockchainTxHash}`} target="_blank" rel="noreferrer"
                      style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--navy-400)', fontWeight: 600 }}>
                      Verify ↗
                    </a>
                  </div>
                )}
              </div>

              <button className="btn btn-ghost btn-full" onClick={() => setTab('buy')}>
                Upgrade Coverage →
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--s12) var(--s6)' }}>
              <div style={{ fontSize: '4rem', marginBottom: 'var(--s4)' }}>🛡️</div>
              <h2 style={{ marginBottom: 'var(--s2)' }}>No active policy</h2>
              <p style={{ marginBottom: 'var(--s6)' }}>Get protected for this week from just ₹38</p>
              <button className="btn btn-primary btn-lg" onClick={() => setTab('buy')}>Get Protected Now →</button>
            </div>
          )}
        </div>
      )}

      {/* ─── Buy Policy Tab ─────────────────────────────── */}
      {tab === 'buy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
          {activePolicy && (
            <div className="alert-banner warning">
              <Icons.AlertTriangle size={18} />
              <span>You have an active {activePolicy.tier} Shield. Upgrading will replace it for the remaining week.</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            {TIERS.map(tier => {
              const quote = quotes[tier.id];
              const price = quote?.premiumAmountInr || tier.price;
              const isSelected = selectedTier === tier.id;
              return (
                <div key={tier.id} onClick={() => setSelectedTier(tier.id)} style={{
                  background: isSelected ? `rgba(${tier.id === 'BASIC' ? '58,124,184' : tier.id === 'STANDARD' ? '255,107,43' : tier.id === 'PRO' ? '139,92,246' : '245,158,11'},0.1)` : 'var(--bg-card)',
                  border: `1.5px solid ${isSelected ? tier.color : 'var(--border)'}`,
                  borderRadius: 'var(--r-lg)', padding: 'var(--s5)', cursor: 'pointer',
                  transition: 'all var(--t-base)', position: 'relative',
                }}>
                  {tier.popular && <div style={{ position: 'absolute', top: -10, right: 16, background: 'var(--orange-500)', color: 'white', fontSize: '0.6875rem', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--r-full)', textTransform: 'uppercase' }}>Most Popular</div>}
                  {tier.best && <div style={{ position: 'absolute', top: -10, right: 16, background: 'var(--amber-500)', color: 'white', fontSize: '0.6875rem', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--r-full)', textTransform: 'uppercase' }}>Best Value</div>}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--s3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${tier.color}`, background: isSelected ? tier.color : 'transparent', flexShrink: 0, transition: 'background var(--t-fast)' }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)' }}>
                          {tier.emoji} {tier.id} SHIELD
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>₹{tier.daily}/day protection</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {loadingQuotes ? <div className="skeleton" style={{ width: 60, height: 24, borderRadius: 4 }} /> : (
                        <>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 900, color: isSelected ? tier.color : 'var(--text-primary)', lineHeight: 1 }}>
                            {price ? `₹${price}` : '—'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/week</div>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--s4)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    <span>📦 Max: ₹{tier.weeklyMax.toLocaleString('en-IN')}/week</span>
                    <span>🛡️ {tier.triggers.join(', ')}</span>
                  </div>

                  {quote?.premiumBreakdown && isSelected && (
                    <div style={{ marginTop: 'var(--s3)', padding: 'var(--s3)', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--r-md)', fontSize: '0.8125rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>Base premium</span><span>₹{quote.premiumBreakdown.basePremium}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>Seasonal factor</span><span>×{quote.premiumBreakdown.seasonalMultiplier}</span>
                      </div>
                      {quote.premiumBreakdown.loyaltyDiscount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green-400)' }}>
                          <span>Loyalty discount</span><span>-{Math.round(quote.premiumBreakdown.loyaltyDiscount*100)}%</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-primary)', borderTop: '1px solid var(--border)', marginTop: 'var(--s2)', paddingTop: 'var(--s2)' }}>
                        <span>Final premium</span><span style={{ color: tier.color }}>₹{quote.premiumAmountInr}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Auto-renew option */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--s4) var(--s5)', background: 'var(--bg-card)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Enable Auto-Renew</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Auto-debit every Monday. Cancel anytime.</div>
            </div>
            <button onClick={() => setAutoRenew(v => !v)} style={{
              width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: autoRenew ? 'var(--green-500)' : 'var(--bg-elevated)', position: 'relative', transition: 'background var(--t-base)',
            }}>
              <div style={{ position: 'absolute', top: 3, left: autoRenew ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left var(--t-spring)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
            </button>
          </div>

          <button className="btn btn-primary btn-full btn-lg" onClick={handleBuyPolicy} disabled={purchasing || loadingQuotes}>
            {purchasing ? <><div className="spinner" style={{ width: 18, height: 18, borderTopColor: 'white' }} />Processing...</> : `Activate ${selectedTier} Shield →`}
          </button>

          <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            🔒 Secured via Razorpay • ₹1 penny drop for UPI verification
          </p>
        </div>
      )}

      {/* ─── Per-Shift Tab ──────────────────────────────── */}
      {tab === 'shift' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
          <div className="alert-banner info">
            <Icons.Zap size={18} />
            <div>
              <strong>Micro-Insurance — Pay Per Shift</strong>
              <p style={{ marginTop: 4, fontSize: '0.8125rem' }}>No weekly commitment. Activate for just 6 hours. Perfect for irregular schedules.</p>
            </div>
          </div>

          {activeShift ? (
            <div style={{ background: 'rgba(0,196,140,0.08)', border: '1px solid rgba(0,196,140,0.3)', borderRadius: 'var(--r-xl)', padding: 'var(--s6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s4)' }}>
                <div className="status-dot active" />
                <h3 style={{ color: 'var(--green-400)' }}>Shift Active — {activeShift.remainingMinutes}min remaining</h3>
              </div>
              <div className="grid-2" style={{ marginBottom: 'var(--s4)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Coverage</div>
                  <div style={{ fontWeight: 700 }}>₹{activeShift.coverageInr}/shift</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zone</div>
                  <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{activeShift.cityId}</div>
                </div>
              </div>
              <div className="progress-bar" style={{ marginBottom: 'var(--s4)' }}>
                <div className="progress-fill" style={{
                  width: `${(activeShift.remainingMinutes / 360) * 100}%`,
                  background: 'linear-gradient(90deg, var(--green-500), var(--green-400))',
                }} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handleDeactivateShift}>End Shift Early</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              {[
                { tier: 'BASIC', price: 8, daily: 150, emoji: '🔵' },
                { tier: 'STANDARD', price: 12, daily: 260, emoji: '🟠', popular: true },
                { tier: 'PRO', price: 15, daily: 375, emoji: '🟣' },
              ].map(opt => (
                <div key={opt.tier} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)', padding: 'var(--s4) var(--s5)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 4 }}>
                      <span>{opt.emoji}</span>
                      <span style={{ fontWeight: 700 }}>{opt.tier}</span>
                      {opt.popular && <span className="badge badge-orange" style={{ fontSize: '0.625rem' }}>POPULAR</span>}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>₹{opt.daily} coverage for 6 hours</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.25rem', color: 'var(--orange-400)' }}>₹{opt.price}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/shift</div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => handleActivateShift(opt.tier)} disabled={shiftLoading}>
                      {shiftLoading ? <div className="spinner" style={{ width: 14, height: 14, borderTopColor: 'white' }} /> : 'Start'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── History Tab ────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {histLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--r-md)' }} />)}
            </div>
          ) : policyHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--s12)' }}>
              <Icons.FileText size={48} color="var(--text-muted)" />
              <p style={{ marginTop: 'var(--s4)', color: 'var(--text-muted)' }}>No policy history yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              {policyHistory.map(p => {
                const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.lapsed;
                return (
                  <div key={p._id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--s4) var(--s5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.tier} Shield — {p.weekId}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {dayjs(p.startDate).format('D MMM')} – {dayjs(p.endDate).format('D MMM YYYY')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', textAlign: 'right' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--green-400)', fontSize: '0.9375rem' }}>+₹{p.totalPayoutInr || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>₹{p.premiumAmountInr} paid</div>
                      </div>
                      <span style={{ padding: '4px 10px', borderRadius: 'var(--r-full)', background: sc.bg, color: sc.color, fontSize: '0.75rem', fontWeight: 600 }}>
                        {sc.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
