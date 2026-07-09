import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { publicAPI } from "../../services/api";
import { Icons } from "../../components/shared/Icons";

const STEPS = [
  {
    icon: "Users",
    title: "Register in 2 minutes",
    body: "Phone OTP, platform, city, vehicle and shift — no paperwork.",
  },
  {
    icon: "TrendingUp",
    title: "AI risk assessment",
    body: "We score your real exposure from city, season and shift pattern and recommend a plan.",
  },
  {
    icon: "Zap",
    title: "Automatic trigger detection",
    body: "Rainfall, heatwave, AQI, platform outages and curfews are monitored for you — 24/7.",
  },
  {
    icon: "CheckCircle",
    title: "Payout in minutes",
    body: "No claim forms. No adjuster visit. Verified triggers pay out straight to your account.",
  },
];

const TIER_PREVIEW = [
  { id: "BASIC", emoji: "🔵", price: 38, daily: 200 },
  { id: "STANDARD", emoji: "🟠", price: 72, daily: 350, tag: "POPULAR" },
  { id: "PRO", emoji: "🟣", price: 110, daily: 500 },
  { id: "ELITE", emoji: "⭐", price: 148, daily: 700, tag: "BEST" },
];

const CITY_CHIPS = [
  "Mumbai", "Delhi NCR", "Bengaluru", "Hyderabad", "Chennai",
  "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow",
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    publicAPI.getStats().then((r) => setStats(r.data.data)).catch(() => {});
  }, []);

  const statCards = [
    { label: "Riders protected", value: stats ? stats.totalRidersProtected.toLocaleString("en-IN") : "—" },
    { label: "Payouts completed", value: stats ? stats.totalPayoutsCount.toLocaleString("en-IN") : "—" },
    { label: "Total paid out", value: stats ? `₹${(stats.totalPayoutsInr / 100000).toFixed(1)}L` : "—" },
    { label: "Avg. payout time", value: stats ? `${stats.avgPayoutMinutes} min` : "—" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* ─── Nav ─────────────────────────────────────────── */}
      <div
        style={{
          position: "sticky", top: 0, zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "var(--s4) var(--s6)",
          background: "rgba(10,12,20,0.75)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
          <div className="shield-icon active" style={{ width: 36, height: 36, fontSize: "1rem" }}>🛡️</div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 900, color: "var(--text-primary)" }}>
            GigShield
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)" }}>
          <Link to="/risk-map" style={{ fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <Icons.Map size={16} /> Live risk map
          </Link>
          <button className="btn btn-primary" onClick={() => navigate("/auth")}>
            Login / Sign up
          </button>
        </div>
      </div>

      {/* ─── Hero ────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute", top: "-10%", left: "50%", transform: "translateX(-50%)",
            width: 700, height: 700,
            background: "radial-gradient(circle,rgba(255,107,43,0.10) 0%,transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "var(--s8) var(--s6) var(--s6)", textAlign: "center", position: "relative" }} className="slide-up">
          <span className="badge badge-orange" style={{ marginBottom: "var(--s4)", display: "inline-block" }}>
            AI-Powered Parametric Insurance
          </span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 900, lineHeight: 1.1, marginBottom: "var(--s4)", color: "var(--text-primary)" }}>
            Income protection for India's gig workers
          </h1>
          <p style={{ fontSize: "1.0625rem", color: "var(--text-secondary)", marginBottom: "var(--s6)", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
            Rain, heat, AQI or a platform outage stops your shift — GigShield pays you automatically,
            no claim forms, no waiting weeks. Plans from ₹38/week.
          </p>
          <div style={{ display: "flex", gap: "var(--s3)", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={() => navigate("/auth")}>
              Get Protected — 2 min setup →
            </button>
            <Link to="/risk-map" className="btn btn-lg" style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", color: "var(--text-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              See live risk map
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Live stats ──────────────────────────────────── */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 var(--s6) var(--s8)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s4)" }}>
          {statCards.map((s) => (
            <div key={s.label} className="card" style={{ textAlign: "center", padding: "var(--s5)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 900, color: "var(--orange-400)" }}>
                {s.value}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── How it works ────────────────────────────────── */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "var(--s6)" }}>
        <h2 style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: "1.75rem", marginBottom: "var(--s6)", color: "var(--text-primary)" }}>
          How it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--s5)" }}>
          {STEPS.map((s, i) => {
            const Icon = Icons[s.icon];
            return (
              <div key={s.title} className="card" style={{ padding: "var(--s5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", marginBottom: "var(--s3)" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", background: "rgba(255,107,43,0.12)", color: "var(--orange-400)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={20} />
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700 }}>STEP {i + 1}</span>
                </div>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>{s.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Coverage tiers preview ──────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "var(--s6)" }}>
        <h2 style={{ textAlign: "center", fontFamily: "var(--font-display)", fontSize: "1.75rem", marginBottom: "var(--s6)", color: "var(--text-primary)" }}>
          Plans that fit your week
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--s4)" }}>
          {TIER_PREVIEW.map((t) => (
            <div key={t.id} className="card" style={{ textAlign: "center", padding: "var(--s5)", position: "relative" }}>
              {t.tag && (
                <span className="badge badge-orange" style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: "0.625rem" }}>
                  {t.tag}
                </span>
              )}
              <div style={{ fontSize: "1.75rem", marginBottom: 6 }}>{t.emoji}</div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{t.id}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 900, color: "var(--orange-400)" }}>
                ₹{t.price}<span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 400 }}>/week</span>
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>₹{t.daily}/day coverage</div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "var(--s4)" }}>
          Your actual quote is personalized to your city, shift and income — see it after a 2-minute risk assessment.
        </p>
      </div>

      {/* ─── Cities ──────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "var(--s6)", textAlign: "center" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--s3)" }}>
          Live weather, AQI and outage monitoring across 10 cities
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s2)", justifyContent: "center" }}>
          {CITY_CHIPS.map((c) => (
            <span key={c} style={{ fontSize: "0.8125rem", padding: "6px 14px", borderRadius: 999, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* ─── Final CTA ───────────────────────────────────── */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "var(--s8) var(--s6)", textAlign: "center" }}>
        <div className="card" style={{ padding: "var(--s8)" }}>
          <div className="shield-icon active" style={{ width: 52, height: 52, fontSize: "1.5rem", margin: "0 auto var(--s4)" }}>🛡️</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", marginBottom: "var(--s3)", color: "var(--text-primary)" }}>
            Your next shift is protected
          </h2>
          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--s5)" }}>
            Join riders across India already covered by GigShield.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/auth")}>
            Get Protected Now →
          </button>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "var(--s6)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        © {new Date().getFullYear()} GigShield · Parametric income protection for gig workers
      </div>
    </div>
  );
}
