import { useState, useRef } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authActions } from "../../store/index";
import { authAPI, policyAPI } from "../../services/api";

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
const CITIES = [
  { id: "mumbai", label: "Mumbai" },
  { id: "delhi", label: "Delhi NCR" },
  { id: "bengaluru", label: "Bengaluru" },
  { id: "hyderabad", label: "Hyderabad" },
  { id: "chennai", label: "Chennai" },
  { id: "pune", label: "Pune" },
  { id: "kolkata", label: "Kolkata" },
  { id: "ahmedabad", label: "Ahmedabad" },
];

const VEHICLES = [
  { id: "bike", label: "Bike", emoji: "🏍️" },
  { id: "scooter", label: "Scooter", emoji: "🛵" },
  { id: "cycle", label: "Cycle", emoji: "🚲" },
  { id: "car", label: "Car", emoji: "🚗" },
];

const SHIFTS = [
  { id: "morning", label: "Morning", emoji: "🌅" },
  { id: "afternoon", label: "Afternoon", emoji: "☀️" },
  { id: "evening", label: "Evening", emoji: "🌆" },
  { id: "night", label: "Night", emoji: "🌙" },
  { id: "full_day", label: "Full day", emoji: "💪" },
  { id: "split", label: "Split shift", emoji: "⏱️" },
];

const INCOME = [
  { id: 300, label: "Under ₹400", sub: "~₹300/day" },
  { id: 500, label: "₹400–₹600", sub: "Average" },
  { id: 750, label: "₹600–₹900", sub: "Good days" },
  { id: 1100, label: "Over ₹900", sub: "Top earner" },
];
const TIERS = [
  { id: "BASIC", emoji: "🔵", price: 38, daily: 200 },
  { id: "STANDARD", emoji: "🟠", price: 72, daily: 350, tag: "POPULAR" },
  { id: "PRO", emoji: "🟣", price: 110, daily: 500 },
  { id: "ELITE", emoji: "⭐", price: 148, daily: 700, tag: "BEST" },
];

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
  const [riskScore, setRiskScore] = useState(null);
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

      console.log("LOGIN RESPONSE", res);

      if (!res.success) {
        throw new Error("OTP failed");
      }

      const { accessToken, refreshToken, user } = res.data;

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

      toast.error("Invalid OTP");

      setOtp(["", "", "", "", "", ""]);

      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const calcRisk = async () => {
    setLoading(true);
    try {
      const res = await policyAPI.getQuote("STANDARD");
      setRiskScore(res.data.data?.premiumBreakdown?.riskScore || 0.65);
    } catch {
      setRiskScore(0.65);
    } finally {
      setLoading(false);
      setStep(9);
    }
  };

  const finish = async () => {
    setLoading(true);

    try {
      const res = await authAPI.onboard({
        name,

        language: "hi",

        platform,

        vehicleType: vehicle,

        shiftPattern: shift,

        declaredDailyIncome: income,

        cityId: city,
      });

      toast.success("🎉 Welcome to GigShield!");

      dispatch(authActions.setUser(res.data.user));

      navigate("/dashboard");
    } catch (err) {
      console.error(err);

      toast.error("Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const riskColor =
    riskScore > 0.7
      ? "var(--red-400)"
      : riskScore > 0.4
        ? "var(--amber-400)"
        : "var(--green-400)";
  const riskLabel =
    riskScore > 0.7
      ? "HIGH RISK"
      : riskScore > 0.4
        ? "MODERATE RISK"
        : "LOW RISK";

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

        {isNew && step > 2 && step < 9 && (
          <div style={{ marginBottom: "var(--s5)" }}>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${((step - 3) / 6) * 100}%` }}
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
              Step {step - 2} of 8
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
                calcRisk();
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

        {step === 9 && (
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
                {Math.round((riskScore || 0.65) * 100)}
              </div>
              <span className="badge badge-orange">{riskLabel}</span>
              <p style={{ fontSize: "0.875rem", marginTop: "var(--s3)" }}>
                Based on {city}, {platform}, and seasonal patterns.
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--s3)",
                marginBottom: "var(--s5)",
              }}
            >
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  style={{
                    background:
                      tier === t.id ? "rgba(255,107,43,0.1)" : "var(--bg-card)",
                    border: `1.5px solid ${tier === t.id ? "var(--orange-500)" : "var(--border)"}`,
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
                    <span style={{ fontSize: "1.5rem" }}>{t.emoji}</span>
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
                        {t.id}{" "}
                        {t.tag && (
                          <span
                            className="badge badge-orange"
                            style={{ fontSize: "0.625rem" }}
                          >
                            {t.tag}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        ₹{t.daily}/day coverage
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
                          tier === t.id
                            ? "var(--orange-400)"
                            : "var(--text-primary)",
                      }}
                    >
                      ₹{t.price}
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
              onClick={finish}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div
                    className="spinner"
                    style={{ width: 18, height: 18, borderTopColor: "white" }}
                  />
                  Setting up...
                </>
              ) : (
                `Start with ${tier} Shield 🛡️`
              )}
            </button>
          </div>
        )}

        {isNew && step > 2 && step < 9 && (
          <div className="step-dots" style={{ marginTop: "var(--s6)" }}>
            {[3, 4, 5, 6, 7, 8, 9].map((s, i) => (
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
