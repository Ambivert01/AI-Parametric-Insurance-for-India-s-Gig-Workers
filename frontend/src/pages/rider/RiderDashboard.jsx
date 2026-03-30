import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  selectUser,
  selectDashboard,
  dashboardActions,
} from "../../store/index";
import { analyticsAPI, communityAPI, walletAPI } from "../../services/api";
import Icons from "../../components/shared/Icons";
import dayjs from "dayjs";

const TRIG = {
  HEAVY_RAIN: { icon: "🌧️", color: "var(--navy-400)" },
  AQI_SPIKE: { icon: "😷", color: "var(--amber-400)" },
  EXTREME_HEAT: { icon: "🌡️", color: "var(--red-400)" },
  CURFEW: { icon: "🚫", color: "var(--red-500)" },
  PLATFORM_OUTAGE: { icon: "📵", color: "var(--gray-400)" },
  CYCLONE: { icon: "🌀", color: "var(--navy-400)" },
};
const STAT = {
  payout_completed: { label: "Paid", color: "var(--green-400)", icon: "✅" },
  approved: { label: "Approved", color: "var(--green-400)", icon: "✅" },
  fraud_screening: {
    label: "Processing",
    color: "var(--amber-400)",
    icon: "⚙️",
  },
  pending_verification: {
    label: "Verify",
    color: "var(--orange-400)",
    icon: "📸",
  },
  rejected: { label: "Rejected", color: "var(--red-400)", icon: "❌" },
};
const LOYALTY = {
  none: { label: "Rider", icon: "🛵", color: "var(--text-muted)" },
  silver_rider: { label: "Silver", icon: "🥈", color: "var(--gray-300)" },
  gold_rider: { label: "Gold", icon: "🥇", color: "var(--amber-400)" },
  elite_rider: { label: "Elite", icon: "🏆", color: "var(--orange-400)" },
  legend_rider: { label: "Legend", icon: "⭐", color: "var(--amber-400)" },
};

export default function RiderDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const { riderData, communityStats } = useSelector(selectDashboard);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      analyticsAPI
        .riderDashboard()
        .then((r) => dispatch(dashboardActions.setRiderDashboard(r.data.data))),

      communityAPI
        .stats(user?.riderProfile?.cityId)
        .then((r) => dispatch(dashboardActions.setCommunityStats(r.data.data))),

      walletAPI
        .balance()
        .then((r) => dispatch(dashboardActions.setWalletBalance(r.data.data))),
    ]).finally(() => setLoading(false));
  }, []);

  const data = riderData;
  const policy = data?.activePolicy;
  const loyalty = data?.loyalty;
  const tc = LOYALTY[loyalty?.tier || "none"];

  if (loading)
    return (
      <div
        style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 120, borderRadius: "var(--r-lg)" }}
          />
        ))}
      </div>
    );

  return (
    <div
      className="page-enter"
      style={{ display: "flex", flexDirection: "column", gap: "var(--s5)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: 4 }}>
            Namaste, {user?.name?.split(" ")[0]} 🙏
          </h1>
          <p style={{ fontSize: "0.875rem" }}>
            {dayjs().format("dddd, D MMMM YYYY")}
          </p>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}
        >
          <span style={{ fontSize: "1.25rem" }}>{tc.icon}</span>
          <span
            style={{ color: tc.color, fontSize: "0.875rem", fontWeight: 600 }}
          >
            {tc.label} Rider
          </span>
        </div>
      </div>

      {policy ? (
        <div
          style={{
            background:
              "linear-gradient(135deg,var(--navy-700),var(--navy-600))",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-xl)",
            padding: "var(--s6)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -20,
              right: -20,
              width: 160,
              height: 160,
              background:
                "radial-gradient(circle,rgba(255,107,43,0.15) 0%,transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "var(--s5)",
              position: "relative",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--s2)",
                  marginBottom: "var(--s2)",
                }}
              >
                <div className="status-dot active" />
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color: "var(--green-400)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Active Policy
                </span>
              </div>
              <h2 style={{ fontSize: "1.375rem", marginBottom: 4 }}>
                {policy.tier} Shield
              </h2>
              <p style={{ fontSize: "0.8125rem" }}>
                Week {policy.weekId} • expires{" "}
                {dayjs(policy.endDate).format("D MMM")}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "2rem",
                  fontWeight: 900,
                  color: "var(--green-400)",
                  lineHeight: 1,
                }}
              >
                ₹{policy.totalPayoutInr || 0}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                earned this week
              </div>
            </div>
          </div>
          <div style={{ marginBottom: "var(--s4)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "var(--s2)",
                fontSize: "0.8125rem",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>
                Coverage remaining
              </span>
              <span style={{ fontWeight: 600 }}>
                ₹{policy.remainingCoverInr} / ₹{policy.weeklyMaxInr}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${((policy.remainingCoverInr || 0) / policy.weeklyMaxInr) * 100}%`,
                  background:
                    "linear-gradient(90deg,var(--orange-500),var(--orange-400))",
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate("/policies")}
            >
              View Policy
            </button>
            {!policy.isAutoRenew && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => navigate("/policies")}
              >
                Enable Auto-Renew
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            border: "2px dashed var(--border-strong)",
            borderRadius: "var(--r-xl)",
            padding: "var(--s8)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "var(--s3)" }}>🛡️</div>
          <h3 style={{ marginBottom: "var(--s2)" }}>No active coverage</h3>
          <p style={{ marginBottom: "var(--s5)", fontSize: "0.875rem" }}>
            Get covered from ₹38/week
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/policies/buy")}
          >
            Get Protected Now →
          </button>
        </div>
      )}

      <div className="grid-2" style={{ gap: "var(--s3)" }}>
        {[
          {
            icon: <Icons.Wallet size={18} color="var(--green-400)" />,
            label: "Total Protected",
            val: `₹${(data?.totalProtectedInr || 0).toLocaleString("en-IN")}`,
            sub: `${data?.totalClaimsCount || 0} payouts`,
            c: "var(--green-400)",
          },
          {
            icon: <Icons.Award size={18} color={tc.color} />,
            label: "Safe Streak",
            val: `${loyalty?.safeWeekStreak || 0}w 🔥`,
            sub: `${loyalty?.discountPercent || 0}% discount`,
            c: tc.color,
          },
          {
            icon: <Icons.Zap size={18} color="var(--orange-400)" />,
            label: "Wallet",
            val: `₹${data?.loyalty?.walletBalanceInr || 0}`,
            sub: "Redeemable credits",
            c: "var(--orange-400)",
          },
          {
            icon: <Icons.Users size={18} color="var(--navy-400)" />,
            label: "Zone Riders",
            val: communityStats?.activePoliciesInZone || "—",
            sub: "in your area",
            c: "var(--navy-400)",
          },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s2)",
                marginBottom: "var(--s2)",
              }}
            >
              {s.icon}
              <span className="stat-label">{s.label}</span>
            </div>
            <div
              className="stat-value"
              style={{ color: s.c, fontSize: "1.5rem" }}
            >
              {s.val}
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {s.sub}
            </span>
          </div>
        ))}
      </div>

      {communityStats?.socialProofMessage && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: "var(--s4) var(--s5)",
            display: "flex",
            alignItems: "center",
            gap: "var(--s3)",
          }}
        >
          <span style={{ fontSize: "1.25rem" }}>👥</span>
          <p style={{ fontSize: "0.875rem", margin: 0 }}>
            {communityStats.socialProofMessage}
          </p>
        </div>
      )}

      {data?.recentClaims?.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--s4)",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Recent Claims</h3>
            <button
              style={{
                background: "none",
                border: "none",
                color: "var(--orange-400)",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
              onClick={() => navigate("/claims")}
            >
              View All →
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s3)",
            }}
          >
            {data.recentClaims.slice(0, 3).map((claim) => {
              const sc = STAT[claim.status] || {
                label: claim.status,
                color: "var(--text-muted)",
                icon: "❓",
              };
              const tc2 = TRIG[claim.triggerType] || { icon: "⚡" };
              return (
                <div
                  key={claim._id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-md)",
                    padding: "var(--s4)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onClick={() => navigate(`/claims/${claim._id}`)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--s3)",
                    }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>{tc2.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                        {claim.triggerType?.replace(/_/g, " ")}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {dayjs(claim.createdAt).format("D MMM")}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--s3)",
                    }}
                  >
                    {claim.finalPayoutInr > 0 && (
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 700,
                          color: "var(--green-400)",
                        }}
                      >
                        +₹{claim.finalPayoutInr}
                      </span>
                    )}
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "var(--r-full)",
                        background: `${sc.color}22`,
                        color: sc.color,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {sc.icon} {sc.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div
        style={{
          background:
            "linear-gradient(135deg,rgba(0,196,140,0.08),rgba(0,196,140,0.03))",
          border: "1px solid rgba(0,196,140,0.2)",
          borderRadius: "var(--r-lg)",
          padding: "var(--s5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s2)",
            marginBottom: "var(--s3)",
          }}
        >
          <span style={{ fontSize: "1.25rem" }}>🌊</span>
          <h4 style={{ fontWeight: 700, color: "var(--green-400)" }}>
            Community Pool Active
          </h4>
        </div>
        <p style={{ fontSize: "0.875rem", margin: 0 }}>
          10% of unclaimed premiums fund community payouts.{" "}
          <strong style={{ color: "var(--green-400)" }}>
            You contribute by staying insured.
          </strong>
        </p>
      </div>
    </div>
  );
}
