import { useState, useRef } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authActions } from "../../store/index";
import { authAPI, policyAPI, kycAPI } from "../../services/api";

const PLATFORMS = [
  { id: "zomato", label: "Zomato", emoji: "🍕" },
  { id: "swiggy", label: "Swiggy", emoji: "🛵" },
  { id: "zepto", label: "Zepto", emoji: "⚡" },
  { id: "blinkit", label: "Blinkit", emoji: "🟡" },
  { id: "amazon", label: "Amazon", emoji: "📦" },
  { id: "flipkart", label: "Flipkart", emoji: "🛍️" },
  { id: "dunzo", label: "Dunzo", emoji: "🏃" },
  { id: "other", label: "Other", emoji: "🛺" },
];

// Full 10-city list — must match backend SUPPORTED_CITIES exactly, or
// onboarding fails Joi validation server-side.
const CITIES = [
  { id: "mumbai", label: "Mumbai" },
  { id: "delhi", label: "Delhi NCR" },
  { id: "bengaluru", label: "Bengaluru" },
  { id: "hyderabad", label: "Hyderabad" },
  { id: "chennai", label: "Chennai" },
  { id: "kolkata", label: "Kolkata" },
  { id: "pune", label: "Pune" },
  { id: "ahmedabad", label: "Ahmedabad" },
  { id: "jaipur", label: "Jaipur" },
  { id: "lucknow", label: "Lucknow" },
];

// Must match backend VEHICLE_TYPES exactly ('cycle' is not a valid backend
// value — it's 'bicycle' — and 'auto' / 'on_foot' were missing entirely,
// so selecting either previously made onboarding impossible).
const VEHICLES = [
  { id: "bike", label: "Bike", emoji: "🏍️" },
  { id: "scooter", label: "Scooter", emoji: "🛵" },
  { id: "bicycle", label: "Bicycle", emoji: "🚲" },
  { id: "auto", label: "Auto", emoji: "🛺" },
  { id: "car", label: "Car", emoji: "🚗" },
  { id: "on_foot", label: "On Foot", emoji: "🚶" },
];

const SHIFTS = [
  { id: "morning", label: "Morning", emoji: "🌅", time: "06:00 – 12:00" },
  { id: "afternoon", label: "Afternoon", emoji: "☀️", time: "12:00 – 18:00" },
  { id: "evening", label: "Evening", emoji: "🌆", time: "18:00 – 00:00" },
  { id: "night", label: "Night", emoji: "🌙", time: "00:00 – 06:00" },
  { id: "full_day", label: "Full day", emoji: "💪", time: "06:00 – 22:00" },
  { id: "split", label: "Split shift", emoji: "⏱️", time: "Custom hours" },
];

const INCOME = [
  { id: 300, label: "Under ₹400", sub: "~₹300/day" },
  { id: 500, label: "₹400–₹600", sub: "Average" },
  { id: 750, label: "₹600–₹900", sub: "Good days" },
  { id: 1100, label: "Over ₹900", sub: "Top earner" },
];

const TIER_META = {
  BASIC: { emoji: "🔵" },
  STANDARD: { emoji: "🟠" },
  PRO: { emoji: "🟣" },
  ELITE: { emoji: "⭐" },
};

const TOTAL_WIZARD_STEPS = 9; // steps 3..11
const WIZARD_STEP_IDS = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export default function AuthPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [city, setCity] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [shift, setShift] = useState("");
  const [income, setIncome] = useState(0);

  const [tier, setTier] = useState("STANDARD");
  const [autoRenew, setAutoRenew] = useState(false);
  const [recommendation, setRecommendation] = useState(null); // { riskScore, riskLabel, riskFactors, recommendedTier, tiers }
  const [purchasing, setPurchasing] = useState(false);

  // Step 11 — KYC (skippable, unlocks payouts)
  const [aadhaar, setAadhaar] = useState("");
  const [upiId, setUpiId] = useState("");
  const [kycLoading, setKycLoading] = useState(false);
  const [kycDone, setKycDone] = useState({ aadhaar: false, bank: false });

  const otpRefs = useRef([]);

  const handleOTP = (i, v) => {
    if (!/^\d*$/.test(v)) return;
    const n = [...otp];
    n[i] = v.slice(-1);
    setOtp(n);
    if (v && i < 5) otpRefs.current[i + 1]?.focus();
    if (n.every((d) => d !== "")) setTimeout(() => verifyOTP(n.join("")), 100);
  };
  const handleOTPKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0)
      otpRefs.current[i - 1]?.focus();
  };

  const sendOTP = async () => {
    if (phone.length !== 10)
      return toast.error("Enter a valid 10-digit number");
    setLoading(true);
    try {
      await authAPI.sendOTP(phone);
      toast.success("OTP sent!");
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (code) => {
    setLoading(true);

    try {
      const res = await authAPI.verifyOTP(phone, code || otp.join(""), {
        os: "web",
        userAgent: navigator.userAgent,
        isMockLocation: false,
        hasMockApps: false,
      });

      const { accessToken, refreshToken, user } = res.data.data;

      dispatch(authActions.setTokens({ accessToken, refreshToken }));
      dispatch(authActions.setUser(user));

      if (user.isNewUser || !user.onboardingComplete) {
        setIsNew(true);
        setStep(3);
      } else {
        navigate(user.role === "admin" ? "/admin" : "/dashboard");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error?.message || "Invalid OTP");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Step 1 (Registration) completes here, then Steps 2-3 of the Worker
  // Journey (AI Risk Assessment + Personalized Plan Recommendation) run
  // against the real backend — this used to call a nonexistent
  // policyAPI.getQuote() and silently fall back to a hardcoded 65% for
  // every single rider regardless of profile.
  const submitProfileAndAssess = async () => {
    setLoading(true);
    try {
      const onboardRes = await authAPI.onboard({
        name,
        language: "hi",
        platform,
        vehicleType: vehicle,
        shiftPattern: shift,
        declaredDailyIncome: income,
        cityId: city,
      });
      dispatch(authActions.setUser(onboardRes.data.data.user));

      const recRes = await policyAPI.recommend();
      const rec = recRes.data.data;
      setRecommendation(rec);
      setTier(rec.recommendedTier);
      setStep(9);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error?.message || "Couldn't complete your profile — try again");
    } finally {
      setLoading(false);
    }
  };

  // Step 4 (Policy Purchase) — previously this step didn't exist at all:
  // onboarding saved a profile and dropped straight to the dashboard with
  // zero active policy. This actually creates the policy and confirms
  // payment, matching the same flow used on the Policies page.
  const purchasePolicy = async () => {
    setPurchasing(true);
    try {
      const createRes = await policyAPI.create(tier, autoRenew);
      const { policy, paymentOrder } = createRes.data.data;
      // In production: open Razorpay checkout. For demo: auto-confirm.
      await policyAPI.confirmPayment(policy._id, `pay_mock_${Date.now()}`, "mock_sig", paymentOrder.orderId);
      toast.success(`🛡️ ${tier} Shield activated!`);
      setStep(11);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error?.message || "Purchase failed");
    } finally {
      setPurchasing(false);
    }
  };

  const verifyAadhaarNum = async () => {
    if (aadhaar.replace(/\D/g, "").length !== 12)
      return toast.error("Enter a valid 12-digit Aadhaar number");
    setKycLoading(true);
    try {
      await kycAPI.verifyAadhaar(aadhaar, name);
      setKycDone((d) => ({ ...d, aadhaar: true }));
      toast.success("Aadhaar verified ✓");
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Verification failed");
    } finally {
      setKycLoading(false);
    }
  };

  const verifyUpi = async () => {
    if (!upiId.includes("@")) return toast.error("Enter a valid UPI ID");
    setKycLoading(true);
    try {
      await kycAPI.verifyBank(upiId);
      setKycDone((d) => ({ ...d, bank: true }));
      toast.success("Bank/UPI verified — payouts unlocked ✓");
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Verification failed");
    } finally {
      setKycLoading(false);
    }
  };

  const goToDashboard = () => {
    toast.success("🎉 Welcome to GigShield!");
    navigate("/dashboard");
  };

  const riskScore = recommendation?.riskScore ?? 0;
  const riskColor =
    riskScore > 0.7 ? "var(--red-400)" : riskScore > 0.4 ? "var(--amber-400)" : "var(--green-400)";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--s4)",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 500,
          height: 500,
          background:
            "radial-gradient(circle,rgba(255,107,43,0.07) 0%,transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{ textAlign: "center", marginBottom: "var(--s8)" }}
          className="slide-up"
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--s3)",
              marginBottom: "var(--s2)",
            }}
          >
            <div
              className="shield-icon active"
              style={{ width: 44, height: 44, fontSize: "1.25rem" }}
            >
              🛡️
            </div>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontWeight: 900,
              }}
            >
              GigShield
            </span>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Income protection for delivery workers
          </p>
        </div>

        {isNew && step > 2 && step < 12 && (
          <div style={{ marginBottom: "var(--s5)" }}>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${((step - 3) / (TOTAL_WIZARD_STEPS - 1)) * 100}%` }}
              />
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginTop: "var(--s1)",
                textAlign: "center",
              }}
            >
              Step {step - 2} of {TOTAL_WIZARD_STEPS}
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s2)" }}>Enter Mobile Number</h2>
            <p style={{ marginBottom: "var(--s5)", fontSize: "0.875rem" }}>
              We'll send a 6-digit OTP to verify
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--s2)",
                marginBottom: "var(--s5)",
              }}
            >
              <div
                style={{
                  background: "var(--bg-secondary)",
                  border: "1.5px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  padding: "14px var(--s4)",
                  color: "var(--text-secondary)",
                  flexShrink: 0,
                }}
              >
                🇮🇳 +91
              </div>
              <input
                className="form-input"
                type="tel"
                inputMode="numeric"
                placeholder="9876543210"
                maxLength={10}
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                onKeyDown={(e) => e.key === "Enter" && sendOTP()}
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={sendOTP}
              disabled={loading || phone.length !== 10}
            >
              {loading ? (
                <>
                  <div
                    className="spinner"
                    style={{ width: 18, height: 18, borderTopColor: "white" }}
                  />
                  Sending...
                </>
              ) : (
                "Get OTP →"
              )}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="card page-enter">
            <button
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "var(--s2)",
                marginBottom: "var(--s4)",
                padding: 0,
                fontSize: "0.875rem",
              }}
              onClick={() => setStep(1)}
            >
              ← Back
            </button>
            <h2 style={{ marginBottom: "var(--s2)" }}>Enter OTP</h2>
            <p style={{ marginBottom: "var(--s5)", fontSize: "0.875rem" }}>
              Sent to +91 {phone.slice(0, 5)}XXXXX
            </p>
            <div className="otp-grid" style={{ marginBottom: "var(--s5)" }}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  className={`otp-input ${d ? "filled" : ""}`}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOTP(i, e.target.value)}
                  onKeyDown={(e) => handleOTPKey(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => verifyOTP()}
              disabled={loading || otp.some((d) => !d)}
            >
              {loading ? (
                <>
                  <div
                    className="spinner"
                    style={{ width: 18, height: 18, borderTopColor: "white" }}
                  />
                  Verifying...
                </>
              ) : (
                "Verify OTP"
              )}
            </button>
            <p
              style={{
                textAlign: "center",
                marginTop: "var(--s4)",
                fontSize: "0.8125rem",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>
                Didn't get it?{" "}
              </span>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--orange-400)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
                onClick={sendOTP}
              >
                Resend
              </button>
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s5)" }}>What's your name?</h2>
            <input
              className="form-input"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              style={{ marginBottom: "var(--s5)", fontSize: "1.125rem" }}
            />
            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                if (name.length < 2) return toast.error("Enter your name");
                setStep(4);
              }}
              disabled={name.length < 2}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s4)" }}>Which platform?</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--s3)",
                marginBottom: "var(--s5)",
              }}
            >
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  className={`platform-chip ${platform === p.id ? "selected" : ""}`}
                  style={{
                    flexDirection: "column",
                    gap: 4,
                    padding: "var(--s4)",
                    textAlign: "center",
                  }}
                  onClick={() => setPlatform(p.id)}
                >
                  <span style={{ fontSize: "1.5rem" }}>{p.emoji}</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                if (!platform) return toast.error("Select platform");
                setStep(5);
              }}
              disabled={!platform}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 5 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s4)" }}>Your delivery city?</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--s3)",
                marginBottom: "var(--s5)",
              }}
            >
              {CITIES.map((c) => (
                <button
                  key={c.id}
                  className={`platform-chip ${city === c.id ? "selected" : ""}`}
                  style={{ justifyContent: "center", fontWeight: 500 }}
                  onClick={() => setCity(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                if (!city) return toast.error("Select city");
                setStep(6);
              }}
              disabled={!city}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 6 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s4)" }}>
              Which vehicle do you use?
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--s3)",
                marginBottom: "var(--s5)",
              }}
            >
              {VEHICLES.map((v) => (
                <button
                  key={v.id}
                  className={`platform-chip ${vehicle === v.id ? "selected" : ""}`}
                  style={{
                    flexDirection: "column",
                    gap: 4,
                    padding: "var(--s4)",
                    textAlign: "center",
                  }}
                  onClick={() => setVehicle(v.id)}
                >
                  <span style={{ fontSize: "1.5rem" }}>{v.emoji}</span>

                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                    }}
                  >
                    {v.label}
                  </span>
                </button>
              ))}
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                if (!vehicle) return toast.error("Select vehicle");
                setStep(7);
              }}
              disabled={!vehicle}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 7 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s4)" }}>When do you deliver?</h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--s3)",
                marginBottom: "var(--s5)",
              }}
            >
              {SHIFTS.map((s) => (
                <button
                  key={s.id}
                  className={`platform-chip ${shift === s.id ? "selected" : ""}`}
                  style={{ gap: "var(--s3)" }}
                  onClick={() => setShift(s.id)}
                >
                  <span style={{ fontSize: "1.25rem" }}>{s.emoji}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{s.label}</div>
                    <div
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {s.time}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                if (!shift) return toast.error("Select shift");
                setStep(8);
              }}
              disabled={!shift}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 8 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s4)" }}>
              Daily earnings on a good day?
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--s3)",
                marginBottom: "var(--s5)",
              }}
            >
              {INCOME.map((r) => (
                <button
                  key={r.id}
                  className={`platform-chip ${income === r.id ? "selected" : ""}`}
                  style={{
                    flexDirection: "column",
                    gap: 4,
                    textAlign: "center",
                  }}
                  onClick={() => setIncome(r.id)}
                >
                  <span style={{ fontWeight: 700 }}>{r.label}</span>
                  <span
                    style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                  >
                    {r.sub}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={() => {
                if (!income) return toast.error("Select income");
                submitProfileAndAssess();
              }}
              disabled={!income || loading}
            >
              {loading ? (
                <>
                  <div
                    className="spinner"
                    style={{ width: 18, height: 18, borderTopColor: "white" }}
                  />
                  Calculating risk...
                </>
              ) : (
                "Calculate My Risk →"
              )}
            </button>
          </div>
        )}

        {step === 9 && recommendation && (
          <div className="page-enter">
            <div
              className="card"
              style={{ textAlign: "center", marginBottom: "var(--s4)" }}
            >
              <h2 style={{ marginBottom: "var(--s3)" }}>Your Risk Profile</h2>
              <div
                style={{
                  fontSize: "3rem",
                  fontFamily: "var(--font-display)",
                  fontWeight: 900,
                  color: riskColor,
                  marginBottom: "var(--s2)",
                }}
              >
                {Math.round(riskScore * 100)}
              </div>
              <span className="badge badge-orange">{recommendation.riskLabel}</span>
              <div style={{ textAlign: "left", marginTop: "var(--s4)", display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
                {recommendation.riskFactors.map((f) => (
                  <div key={f.label} style={{ fontSize: "0.8125rem" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{f.label}: </span>
                    <span style={{ color: "var(--text-muted)" }}>{f.detail}</span>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--s3)", textAlign: "center" }}>
              Based on your risk profile, we recommend:
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--s3)",
                marginBottom: "var(--s5)",
              }}
            >
              {Object.entries(recommendation.tiers).map(([tierId, t]) => (
                <button
                  key={tierId}
                  onClick={() => setTier(tierId)}
                  style={{
                    background:
                      tier === tierId ? "rgba(255,107,43,0.1)" : "var(--bg-card)",
                    border: `1.5px solid ${tier === tierId ? "var(--orange-500)" : "var(--border)"}`,
                    borderRadius: "var(--r-md)",
                    padding: "var(--s4)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transition: "all var(--t-base)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--s3)",
                    }}
                  >
                    <span style={{ fontSize: "1.5rem" }}>{TIER_META[tierId].emoji}</span>
                    <div style={{ textAlign: "left" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--s2)",
                        }}
                      >
                        {tierId}{" "}
                        {tierId === recommendation.recommendedTier && (
                          <span
                            className="badge badge-orange"
                            style={{ fontSize: "0.625rem" }}
                          >
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        ₹{t.tierDetails.daily_coverage_inr}/day coverage
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 900,
                        fontSize: "1.25rem",
                        color:
                          tier === tierId
                            ? "var(--orange-400)"
                            : "var(--text-primary)",
                      }}
                    >
                      ₹{t.premiumAmountInr}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      /week
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => setStep(10)}
            >
              Continue with {tier} Shield →
            </button>
          </div>
        )}

        {step === 10 && recommendation && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s2)" }}>Activate your cover</h2>
            <p style={{ marginBottom: "var(--s5)", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Coverage starts the moment payment is confirmed.
            </p>
            <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--r-md)", padding: "var(--s4)", marginBottom: "var(--s4)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
                <span style={{ fontSize: "1.5rem" }}>{TIER_META[tier].emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{recommendation.tiers[tier].tierDetails.label}</div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>₹{recommendation.tiers[tier].tierDetails.daily_coverage_inr}/day · up to ₹{recommendation.tiers[tier].tierDetails.weekly_max_inr}/week</div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.25rem", color: "var(--orange-400)" }}>
                ₹{recommendation.tiers[tier].premiumAmountInr}<span style={{fontSize:"0.75rem", color:"var(--text-muted)", fontWeight:400}}>/wk</span>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginBottom: "var(--s5)", fontSize: "0.875rem", cursor: "pointer" }}>
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              Auto-renew every week
            </label>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={purchasePolicy}
              disabled={purchasing}
              style={{ marginBottom: "var(--s3)" }}
            >
              {purchasing ? (
                <>
                  <div className="spinner" style={{ width: 18, height: 18, borderTopColor: "white" }} />
                  Processing...
                </>
              ) : (
                `Activate ${tier} Shield →`
              )}
            </button>
            <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              🔒 Secured via Razorpay
            </p>
          </div>
        )}

        {step === 11 && (
          <div className="card page-enter">
            <h2 style={{ marginBottom: "var(--s2)" }}>Unlock instant payouts</h2>
            <p style={{ marginBottom: "var(--s5)", fontSize: "0.875rem", color: "var(--text-muted)" }}>
              You're protected already. Verify Aadhaar and UPI now so a confirmed claim can pay out straight to your account — or do this later from your Profile.
            </p>

            <div style={{ marginBottom: "var(--s4)" }}>
              <div style={{ display: "flex", gap: "var(--s2)" }}>
                <input
                  className="form-input"
                  placeholder="12-digit Aadhaar number"
                  maxLength={14}
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  disabled={kycDone.aadhaar}
                />
                <button className="btn" style={{ background: kycDone.aadhaar ? "var(--green-400)" : "var(--bg-secondary)", border: "1.5px solid var(--border)", color: kycDone.aadhaar ? "white" : "var(--text-primary)", flexShrink: 0, padding: "0 var(--s4)" }} onClick={verifyAadhaarNum} disabled={kycLoading || kycDone.aadhaar}>
                  {kycDone.aadhaar ? "✓ Verified" : "Verify"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "var(--s5)" }}>
              <div style={{ display: "flex", gap: "var(--s2)" }}>
                <input
                  className="form-input"
                  placeholder="yourname@upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  disabled={kycDone.bank}
                />
                <button className="btn" style={{ background: kycDone.bank ? "var(--green-400)" : "var(--bg-secondary)", border: "1.5px solid var(--border)", color: kycDone.bank ? "white" : "var(--text-primary)", flexShrink: 0, padding: "0 var(--s4)" }} onClick={verifyUpi} disabled={kycLoading || kycDone.bank}>
                  {kycDone.bank ? "✓ Verified" : "Verify"}
                </button>
              </div>
            </div>

            <button className="btn btn-primary btn-full btn-lg" onClick={goToDashboard} style={{ marginBottom: "var(--s3)" }}>
              {kycDone.aadhaar && kycDone.bank ? "Go to Dashboard →" : "Skip for now — Go to Dashboard →"}
            </button>
          </div>
        )}

        {isNew && step > 2 && step < 12 && (
          <div className="step-dots" style={{ marginTop: "var(--s6)" }}>
            {WIZARD_STEP_IDS.map((s, i) => (
              <div
                key={i}
                className={`step-dot ${step === s ? "active" : step > s ? "done" : ""}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
