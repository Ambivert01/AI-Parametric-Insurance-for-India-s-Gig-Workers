import { useEffect, useState } from 'react';
import { paymentAPI, walletAPI } from '../../services/api';
import Icons from '../../components/shared/Icons';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

export default function PaymentsPageImpl() {
  const [payouts, setPayouts] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [upiId, setUpiId] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    Promise.all([
      paymentAPI.getHistory(1, 20).then(r => { setPayouts(r.data.data || []); setTotal(r.data.meta?.pagination?.total || 0); }),
      walletAPI.getBalance().then(r => setWallet(r.data.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const verifyBank = async () => {
    if (!upiId.includes('@')) return toast.error('Enter a valid UPI ID');
    setVerifying(true);
    try {
      await paymentAPI.verifyBank(upiId);
      toast.success('✅ UPI verified! Payouts will go here.');
      setUpiId('');
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Verification failed'); }
    finally { setVerifying(false); }
  };

  const totalPayouts = payouts.reduce((s, p) => s + (p.amountInr || 0), 0);

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
      <h1>Payments</h1>

      {/* Wallet summary */}
      {wallet && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)' }}>
          <div className="stat-card" style={{ background: 'linear-gradient(135deg,rgba(0,196,140,0.1),rgba(0,196,140,0.04))' }}>
            <span className="stat-label">Total Received</span>
            <div className="stat-value" style={{ color: 'var(--green-400)', fontSize: '1.5rem' }}>₹{totalPayouts.toLocaleString('en-IN')}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{total} payouts</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Wallet Credits</span>
            <div className="stat-value" style={{ color: 'var(--orange-400)', fontSize: '1.5rem' }}>₹{wallet.balanceInr || 0}</div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{wallet.discountPercent}% premium discount</span>
          </div>
        </div>
      )}

      {/* UPI Setup */}
      <div className="card">
        <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s3)' }}>Payment Account</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--s4)' }}>
          All payouts are sent instantly to your UPI ID or bank account.
        </p>
        <div style={{ display: 'flex', gap: 'var(--s3)' }}>
          <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="yourname@upi / 9876543210@paytm" className="form-input" style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={verifyBank} disabled={verifying}>
            {verifying ? <div className="spinner" style={{ width: 16, height: 16, borderTopColor: 'white' }} /> : 'Verify'}
          </button>
        </div>
      </div>

      {/* Payout history */}
      <div>
        <h3 style={{ fontSize: '0.9375rem', marginBottom: 'var(--s4)' }}>Payout History</h3>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--r-md)' }} />)}
          </div>
        ) : payouts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--s12)', color: 'var(--text-muted)' }}>
            <Icons.Wallet size={48} color="var(--text-muted)" />
            <p style={{ marginTop: 'var(--s4)' }}>No payouts yet. Your first payout will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            {payouts.map(p => (
              <div key={p._id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--s4) var(--s5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Claim Payout</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {dayjs(p.completedAt || p.initiatedAt).format('D MMM YYYY, h:mm A')} • {p.channel?.toUpperCase()}
                  </div>
                  {p.payoutRef && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>Ref: {p.payoutRef}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--green-400)' }}>+₹{p.amountInr}</div>
                  <span className={`badge ${p.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
