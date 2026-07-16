import { useEffect, useState } from 'react';
import { analyticsAPI } from '../../services/api';
import Icons from '../../components/shared/Icons';

const Metric = ({ label, value, sub, color = 'var(--text-primary)' }) => (
  <div className="card" style={{ padding: 'var(--s5)' }}>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 900, color, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
  </div>
);

const Unavailable = ({ label, note }) => (
  <div className="card" style={{ padding: 'var(--s5)', opacity: 0.6 }}>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
    <div style={{ fontSize: '0.9375rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Not tracked</div>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{note}</div>
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 'var(--s6)' }}>
    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 'var(--s3)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{title}</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s3)' }}>
      {children}
    </div>
  </div>
);

export default function ExecutiveDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsAPI.getExecutiveDashboard()
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'var(--s4)' }}>
        {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--r-lg)' }} />)}
      </div>
    );
  }

  if (!data) return <p style={{ color: 'var(--text-muted)' }}>Unable to load executive dashboard.</p>;

  const { growth, financial, risk, customer, ai, fraud, geographic } = data;

  return (
    <div>
      <div style={{ marginBottom: 'var(--s6)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <Icons.TrendingUp /> Executive Dashboard
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Business intelligence for leadership — updated {new Date(data.generatedAt).toLocaleString('en-IN')}
        </p>
      </div>

      <Section title="Growth">
        <Metric label="Total Workers" value={growth.totalWorkers.toLocaleString('en-IN')} />
        <Metric label="Active Workers" value={growth.activeWorkers.toLocaleString('en-IN')} sub="currently covered by an active policy" />
        <Metric label="New Registrations (30d)" value={growth.newRegistrations30d.toLocaleString('en-IN')} />
        <Metric
          label="Monthly Growth"
          value={`${growth.monthlyGrowthPercent > 0 ? '+' : ''}${growth.monthlyGrowthPercent}%`}
          color={growth.monthlyGrowthPercent >= 0 ? 'var(--green-400)' : 'var(--red-400)'}
          sub="vs. prior 30-day period"
        />
      </Section>

      <Section title="Financial">
        <Metric label="Premium Revenue (30d)" value={`₹${financial.premiumRevenue30dInr.toLocaleString('en-IN')}`} />
        <Metric label="Total Payouts (30d)" value={`₹${financial.totalPayouts30dInr.toLocaleString('en-IN')}`} />
        <Metric
          label="Loss Ratio"
          value={financial.lossRatio.toFixed(2)}
          color={financial.lossRatio > 0.7 ? 'var(--red-400)' : financial.lossRatio > 0.4 ? 'var(--amber-400)' : 'var(--green-400)'}
          sub="payouts ÷ premium"
        />
        <Metric
          label="Underwriting Margin"
          value={`${financial.underwritingMarginPercent}%`}
          sub="premium − payouts, before opex"
        />
        <Unavailable label="Operating Cost" note={financial.operatingCost.note} />
      </Section>

      <Section title="Risk">
        <Metric label="High-Risk Cities" value={risk.highRiskCities.length} sub={risk.highRiskCities.map((c) => c.name).join(', ') || 'none currently'} />
        <Metric label="Climate Exposure" value={`${risk.climateExposurePercent}%`} sub="active policies in high-risk cities" />
        <Metric
          label="Trigger Frequency (30d)"
          value={risk.triggerFrequency30d.reduce((s, t) => s + t.count, 0)}
          sub={risk.triggerFrequency30d.slice(0, 3).map((t) => `${t.triggerType} (${t.count})`).join(', ') || 'none'}
        />
        <Metric
          label="Claim Forecast (next period)"
          value={risk.claimForecastNextPeriod.reduce((s, c) => s + c.predictedClaims, 0)}
          sub="predicted claims across top cities"
        />
      </Section>

      <Section title="Customer">
        <Metric label="Policy Renewal Rate" value={`${customer.policyRenewalRatePercent}%`} sub="active policies with auto-renew on" />
        {customer.retentionRatePercent !== null ? (
          <Metric label="Retention Rate" value={`${customer.retentionRatePercent}%`} sub="riders active this week who were active last week" />
        ) : (
          <Unavailable label="Retention Rate" note="Not enough weekly history yet." />
        )}
        {customer.churnRatePercent !== null ? (
          <Metric label="Churn Rate" value={`${customer.churnRatePercent}%`} color={customer.churnRatePercent > 30 ? 'var(--red-400)' : 'var(--text-primary)'} />
        ) : (
          <Unavailable label="Churn Rate" note="Not enough weekly history yet." />
        )}
        <Unavailable label="Customer Satisfaction" note={customer.customerSatisfaction.note} />
      </Section>

      <Section title="AI">
        <Metric label="Auto-Approval Rate" value={`${ai.autoApprovalRatePercent}%`} sub="claims resolved with zero manual review" />
        <Metric label="Fraud Prevention Rate" value={`${ai.fraudPreventionRatePercent}%`} sub="claims held or flagged for review" />
        <Unavailable label="Model Accuracy" note={ai.modelAccuracy.note} />
        <Unavailable label="Recommendation Adoption" note={ai.recommendationAdoption.note} />
      </Section>

      <Section title="Fraud">
        <Metric label="Fraud Loss Prevented (30d)" value={`₹${fraud.fraudLossPreventedInr.toLocaleString('en-IN')}`} sub={`${fraud.fraudBlockedClaimsCount} claim(s) blocked`} color="var(--green-400)" />
        <Metric label="Suspicious Claims (30d)" value={fraud.suspiciousClaims30d} sub="ORANGE + RED tier" />
        <Metric label="Manual Investigations Open" value={fraud.manualInvestigationsOpen} />
        <Metric label="Claims Rejected (30d)" value={fraud.claimsRejected30d} />
      </Section>

      <div style={{ marginBottom: 'var(--s4)' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 'var(--s3)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Geographic Intelligence
        </h3>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>City</th><th>Active Policies</th><th>Risk Score</th><th>Risk Level</th></tr></thead>
            <tbody>
              {geographic.sort((a, b) => b.riskScore - a.riskScore).map((c) => (
                <tr key={c.cityId}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.name}</td>
                  <td>{c.activePolicies}</td>
                  <td>{c.riskScore}</td>
                  <td>
                    <span style={{
                      color: c.riskLevel === 'high' ? 'var(--red-400)' : c.riskLevel === 'medium' ? 'var(--amber-400)' : 'var(--green-400)',
                      fontWeight: 600, textTransform: 'capitalize',
                    }}>
                      {c.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
