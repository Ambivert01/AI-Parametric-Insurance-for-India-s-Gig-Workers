import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { claimsAPI } from '../../services/api';
import Icons from '../../components/shared/Icons';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const FRAUD_TIER_CONFIG = {
  GREEN:  { label: 'Clean', color: 'var(--green-400)', bg: 'rgba(0,196,140,0.1)', desc: 'Auto-approved — all signals passed' },
  YELLOW: { label: 'Low Risk', color: 'var(--amber-400)', bg: 'rgba(245,158,11,0.1)', desc: 'Approved with soft verification' },
  ORANGE: { label: 'Held', color: 'var(--orange-400)', bg: 'rgba(255,107,43,0.1)', desc: 'Manual review required' },
  RED:    { label: 'Rejected', color: 'var(--red-400)', bg: 'rgba(239,68,68,0.1)', desc: 'Fraud signals detected' },
};

export default function ClaimDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadClaim();
  }, [id]);

  const loadClaim = async () => {
    setLoading(true);
    try {
      const res = await claimsAPI.getById(id);
      setClaim(res.data.data);
    } catch { toast.error('Claim not found'); navigate('/claims'); }
    finally { setLoading(false); }
  };

  const submitAppeal = async () => {
    if (appealText.trim().length < 20) return toast.error('Please provide more detail (min 20 chars)');
    setSubmitting(true);
    try {
      await claimsAPI.submitAppeal(id, appealText);
      toast.success('Appeal submitted! We\'ll review within 4 hours.');
      setAppealOpen(false);
      loadClaim();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Appeal failed');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--s16)' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;
  if (!claim) return null;

  const fraudCfg = FRAUD_TIER_CONFIG[claim.fraudCheck?.tier] || FRAUD_TIER_CONFIG.GREEN;
  const canAppeal = claim.status === 'rejected' && claim.appealDeadline && new Date() < new Date(claim.appealDeadline);

  const TIMELINE = [
    { label: 'Event Detected', time: claim.detectedAt, done: true, icon: '🔍' },
    { label: 'Fraud Screening', time: claim.fraudCheckedAt, done: !!claim.fraudCheckedAt, icon: '🛡️' },
    { label: 'Claim Approved', time: claim.approvedAt, done: !!claim.approvedAt, icon: '✅' },
    { label: 'Payout Initiated', time: claim.payoutInitiatedAt, done: !!claim.payoutInitiatedAt, icon: '💸' },
    { label: 'Money Received', time: claim.payoutCompletedAt, done: !!claim.payoutCompletedAt, icon: '💰' },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)', maxWidth: 640 }}>
      {/* Back */}
      <button onClick={() => navigate('/claims')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>
        <Icons.ArrowLeft size={16} /> Back to Claims
      </button>

      {/* Header */}
      <div className="card-elevated">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--s4)' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>{claim.triggerType?.replace(/_/g,' ')}</h2>
            <p style={{ fontSize: '0.875rem' }}>Claim #{claim.claimId}</p>
          </div>
          {claim.finalPayoutInr > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--green-400)', lineHeight: 1 }}>
                ₹{claim.finalPayoutInr}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>payout amount</div>
            </div>
          )}
        </div>

        <div className="grid-2">
          {[
            { label: 'City', val: claim.cityId },
            { label: 'Trigger Value', val: `${claim.triggerValue} (${claim.triggerType?.includes('AQI') ? 'AQI' : 'mm'})` },
            { label: 'Daily Coverage', val: `₹${claim.dailyCoverageInr}` },
            { label: 'Disruption', val: `${Math.round(claim.disruptionHours)}h (${Math.round(claim.disruptionFraction * 100)}%)` },
            { label: 'Detected', val: dayjs(claim.detectedAt).format('D MMM, h:mm A') },
            { label: 'Processing', val: claim.totalProcessingMs ? `${Math.round(claim.totalProcessingMs/60000)}min` : 'In progress' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s5)' }}>Claim Timeline</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {TIMELINE.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--s4)', position: 'relative' }}>
              {/* Line */}
              {i < TIMELINE.length - 1 && (
                <div style={{ position: 'absolute', left: 11, top: 24, width: 2, height: 'calc(100% + 4px)', background: step.done ? 'var(--green-500)' : 'var(--border)', zIndex: 0, transition: 'background var(--t-slow)' }} />
              )}
              {/* Dot */}
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: step.done ? 'var(--green-500)' : 'var(--bg-elevated)', border: `2px solid ${step.done ? 'var(--green-500)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0, zIndex: 1, transition: 'all var(--t-slow)' }}>
                {step.done ? '✓' : ''}
              </div>
              {/* Content */}
              <div style={{ flex: 1, paddingBottom: 'var(--s4)' }}>
                <div style={{ fontWeight: step.done ? 600 : 400, color: step.done ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {step.icon} {step.label}
                </div>
                {step.time && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{dayjs(step.time).format('D MMM, h:mm:ss A')}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fraud Assessment */}
      {claim.fraudCheck && (
        <div className="card" style={{ border: `1px solid ${fraudCfg.color}33` }}>
          <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s4)' }}>Security Assessment</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s4)' }}>
            <div>
              <div style={{ fontWeight: 700, color: fraudCfg.color, fontSize: '1.125rem', marginBottom: 4 }}>
                {fraudCfg.label}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{fraudCfg.desc}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2rem', color: fraudCfg.color, lineHeight: 1 }}>
                {claim.fraudCheck.score}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>trust score</div>
            </div>
          </div>

          {/* Signals */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s2)', fontSize: '0.8125rem' }}>
            {[
              { label: 'GPS Zone', val: claim.fraudCheck.signals?.gpsInZone >= 0 ? '✅ Verified' : '⚠️ Mismatch' },
              { label: 'Cell Tower', val: claim.fraudCheck.signals?.cellTowerMatch >= 0 ? '✅ Matched' : '❌ Mismatch' },
              { label: 'Mock App', val: claim.fraudCheck.signals?.mockLocationDetected ? '❌ Detected' : '✅ Clean' },
              { label: 'Duplicate', val: claim.fraudCheck.signals?.duplicateClaim ? '❌ Yes' : '✅ No' },
              { label: 'Burst Attack', val: claim.fraudCheck.signals?.claimBurst >= 0 ? '✅ Normal' : '⚠️ Elevated' },
              { label: 'Rain Adaptive', val: claim.fraudCheck.rainAdaptive ? '🌧️ Applied' : '—' },
            ].map(sig => (
              <div key={sig.label} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--r-sm)', padding: 'var(--s2) var(--s3)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{sig.label}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{sig.val}</div>
              </div>
            ))}
          </div>

          {claim.fraudCheck.rainAdaptive && (
            <div style={{ marginTop: 'var(--s3)', padding: 'var(--s3)', background: 'rgba(58,124,184,0.1)', borderRadius: 'var(--r-sm)', fontSize: '0.8125rem', color: 'var(--navy-400)' }}>
              🌧️ Rain-adaptive scoring applied — thresholds loosened because heavy rain degrades GPS accuracy for all riders.
            </div>
          )}
        </div>
      )}

      {/* Blockchain */}
      {claim.blockchainTxHash && (
        <div className="card" style={{ border: '1px solid rgba(58,124,184,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 4 }}>
                <Icons.Link size={16} color="var(--navy-400)" />
                <h4 style={{ fontSize: '0.9375rem', color: 'var(--navy-400)' }}>On-Chain Audit Log</h4>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {claim.blockchainTxHash.slice(0,20)}...{claim.blockchainTxHash.slice(-8)}
              </div>
            </div>
            <a href={`https://sepolia.etherscan.io/tx/${claim.blockchainTxHash}`} target="_blank" rel="noreferrer"
              className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
              Verify ↗
            </a>
          </div>
        </div>
      )}

      {/* Appeal section */}
      {canAppeal && !claim.appeal && (
        <div className="card" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
          <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s3)' }}>Claim Rejected — You Can Appeal</h3>
          <p style={{ fontSize: '0.875rem', marginBottom: 'var(--s4)' }}>
            Deadline: {dayjs(claim.appealDeadline).format('D MMM, h:mm A')} ({dayjs(claim.appealDeadline).fromNow()})
          </p>

          {!appealOpen ? (
            <button className="btn btn-outline btn-full" onClick={() => setAppealOpen(true)}>
              Submit Appeal →
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
              <textarea value={appealText} onChange={e => setAppealText(e.target.value)}
                placeholder="Explain why you believe this claim is valid. Include details about where you were and what disruption affected you. (Min 20 characters)"
                rows={4}
                style={{ background: 'var(--bg-secondary)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--s4)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', resize: 'vertical', outline: 'none', width: '100%' }}
                onFocus={e => e.target.style.borderColor = 'var(--orange-500)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {appealText.length}/20 minimum characters
              </div>
              <div style={{ display: 'flex', gap: 'var(--s3)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setAppealOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={submitAppeal} disabled={submitting || appealText.trim().length < 20} style={{ flex: 1 }}>
                  {submitting ? <><div className="spinner" style={{ width: 16, height: 16, borderTopColor: 'white' }} />Submitting...</> : 'Submit Appeal'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Appeal status */}
      {claim.appeal && (
        <div className={`alert-banner ${claim.appeal.decision === 'approved' ? 'success' : claim.appeal.decision === 'rejected' ? 'danger' : 'warning'}`}>
          <span style={{ fontSize: '1.25rem' }}>⚖️</span>
          <div>
            <strong>Appeal {claim.appeal.decision === 'pending' ? 'Under Review' : claim.appeal.decision === 'approved' ? 'Approved!' : 'Rejected'}</strong>
            <p style={{ marginTop: 4, fontSize: '0.8125rem' }}>
              {claim.appeal.decision === 'pending'
                ? 'Our team is reviewing your appeal. Expected within 4 hours.'
                : claim.appeal.decision === 'approved'
                ? `Payout approved! ${claim.appeal.goodwillCreditInr > 0 ? `+₹${claim.appeal.goodwillCreditInr} goodwill credit added.` : ''}`
                : claim.appeal.decisionReason || 'Appeal could not be approved.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
