import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000/api";

const defaultTokens = {
  colors: {
    primary: "#0b57d0",
    secondary: "#14532d",
    accent: "#c2410c",
    surface: "#ffffff",
    text: "#111827",
    muted: "#f3f4f6",
  },
  typography: {
    headingFont: "'Space Grotesk', system-ui",
    bodyFont: "'Manrope', system-ui",
    baseSize: "16px",
    lineHeight: 1.5,
    headingWeight: 700,
    bodyWeight: 400,
  },
  spacing: {
    unit: 8,
    scale: [0, 4, 8, 12, 16, 24, 32, 48],
    radius: { sm: 6, md: 12, lg: 18 },
  },
};

const colorKeys = ["primary", "secondary", "accent", "surface", "text", "muted"];

const featureCards = [
  {
    title: "Extract design tokens",
    description: "Turn any website into a structured token set for color, type, spacing, and radius.",
  },
  {
    title: "Lock what matters",
    description: "Freeze brand-critical tokens while allowing the rest of the theme to evolve.",
  },
  {
    title: "Preview before exporting",
    description: "See your theme applied to buttons, forms, and cards before you ship it.",
  },
  {
    title: "Export anywhere",
    description: "Generate CSS variables, JSON tokens, or Tailwind theme config in one click.",
  },
];

const howItWorksSteps = [
  {
    step: "01",
    title: "Enter a website URL",
    description: "Paste any public website and let StyleSync inspect the visual language.",
  },
  {
    step: "02",
    title: "Review extracted tokens",
    description: "Inspect colors, typography, spacing, and the live component preview.",
  },
  {
    step: "03",
    title: "Edit and lock details",
    description: "Tune values manually and pin the tokens you want to preserve.",
  },
  {
    step: "04",
    title: "Export the system",
    description: "Download the design system as CSS, JSON, or Tailwind theme output.",
  },
];

const faqs = [
  {
    question: "What does StyleSync actually do?",
    answer:
      "It analyzes a website and turns its visual style into editable design tokens you can inspect, change, lock, and export.",
  },
  {
    question: "Do I need the backend running?",
    answer:
      "Yes. The frontend is a rich interface, but token extraction and exports come from the FastAPI backend.",
  },
  {
    question: "Is login real?",
    answer:
      "This version uses a polished front-end auth flow to gate the experience. You can connect it to a backend auth system later.",
  },
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({ name: "", email: "", password: "" });
  const [url, setUrl] = useState("");
  const [siteId, setSiteId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);

  const [tokens, setTokens] = useState(defaultTokens);
  const [extractedTokens, setExtractedTokens] = useState(defaultTokens);
  const [lockedTokens, setLockedTokens] = useState({});

  const computedTokens = useMemo(() => {
    const unit = Number(tokens.spacing.unit || 8);
    return {
      shadow: `0 ${Math.max(2, Math.round(unit / 2))}px ${Math.max(18, unit * 3)}px rgba(0,0,0,0.14)`,
      borderWidth: Math.max(1, Math.round(unit / 8)),
      cardPadding: `${Math.max(12, unit * 2)}px`,
    };
  }, [tokens]);

  const themeVars = useMemo(
    () => ({
      "--color-primary": tokens.colors.primary,
      "--color-secondary": tokens.colors.secondary,
      "--color-accent": tokens.colors.accent,
      "--color-surface": tokens.colors.surface,
      "--color-text": tokens.colors.text,
      "--color-muted": tokens.colors.muted,
      "--font-heading": tokens.typography.headingFont,
      "--font-body": tokens.typography.bodyFont,
      "--font-size-base": tokens.typography.baseSize,
      "--line-height-base": String(tokens.typography.lineHeight),
      "--weight-heading": String(tokens.typography.headingWeight),
      "--weight-body": String(tokens.typography.bodyWeight),
      "--spacing-unit": `${tokens.spacing.unit}px`,
      "--radius-sm": `${tokens.spacing.radius.sm}px`,
      "--radius-md": `${tokens.spacing.radius.md}px`,
      "--radius-lg": `${tokens.spacing.radius.lg}px`,
      "--shadow-card": computedTokens.shadow,
      "--border-width": `${computedTokens.borderWidth}px`,
      "--card-padding": computedTokens.cardPadding,
    }),
    [tokens, computedTokens]
  );

  const heroStats = [
    { value: "3", label: "core token groups" },
    { value: "1", label: "live preview system" },
    { value: "3", label: "export formats" },
  ];

  useEffect(() => {
    document.title = isAuthenticated ? "StyleSync - Workspace" : "StyleSync - Living Design System";
  }, []);

  useEffect(() => {
    document.title = isAuthenticated ? "StyleSync - Workspace" : "StyleSync - Living Design System";
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      setAuthError("");
    }
  }, [isAuthenticated]);

  const tokenOrigin = (path) => {
    if (lockedTokens[path]) return "locked";
    if (getByPath(extractedTokens, path) !== getByPath(tokens, path)) return "computed";
    return "extracted";
  };

  const analyzeSite = async () => {
    setError("");
    setWarnings([]);
    if (!url.trim()) {
      setError("Please enter a valid URL.");
      return;
    }

    try {
      setStatus("loading");
      const response = await axios.post(`${API_BASE}/sites/analyze`, {
        url,
        site_id: siteId,
        use_browser: true,
      });

      const lockedMap = Object.fromEntries((response.data.lockedTokens || []).map((tokenPath) => [tokenPath, true]));
      setSiteId(response.data.siteId);
      setExtractedTokens(response.data.tokens);
      setTokens(response.data.tokens);
      setLockedTokens(lockedMap);
      setWarnings(response.data.warnings || []);

      if (response.data.status === "blocked") {
        setError(response.data.error || "This site blocks scanners. You can continue editing tokens manually.");
      }
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err.response?.data?.detail || "Could not analyze this website. Try another URL or enter tokens manually.");
    }
  };

  const persistTokens = async (nextTokens) => {
    setTokens(nextTokens);
    if (!siteId) return;
    try {
      await axios.put(`${API_BASE}/sites/${siteId}/tokens`, {
        source: "manual-edit",
        tokens: nextTokens,
      });
    } catch (_err) {
      setError("Token update failed to save. Changes are still visible locally.");
    }
  };

  const updateToken = (path, value) => {
    const next = structuredClone(tokens);
    setByPath(next, path, value);
    persistTokens(next);
  };

  const toggleLock = async (path) => {
    const nextLocked = !lockedTokens[path];
    setLockedTokens((prev) => ({ ...prev, [path]: nextLocked }));
    if (!siteId) return;

    try {
      const value = getByPath(tokens, path);
      const response = await axios.post(`${API_BASE}/sites/${siteId}/locks`, {
        token_path: path,
        locked: nextLocked,
        value,
      });
      const lockMap = Object.fromEntries((response.data.lockedTokens || []).map((tokenPath) => [tokenPath, true]));
      setLockedTokens(lockMap);
    } catch (_err) {
      setError("Could not update lock state.");
    }
  };

  const exportTokens = async (format) => {
    if (!siteId) {
      setError("Analyze a site first to export tokens.");
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/sites/${siteId}/export`, {
        params: { format },
        responseType: format === "css" ? "text" : "json",
      });
      const payload = format === "css" ? res.data : JSON.stringify(res.data, null, 2);
      const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `stylesync-tokens.${format === "tailwind" ? "json" : format}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (_err) {
      setError("Export failed. Please try again.");
    }
  };

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      setAuthError("Enter your email and password to continue.");
      return;
    }
    setAuthError("");
    setIsAuthenticated(true);
  };

  const handleSignupSubmit = (event) => {
    event.preventDefault();
    if (!signupForm.name || !signupForm.email || !signupForm.password) {
      setAuthError("Fill in your name, email, and password to create an account.");
      return;
    }
    setAuthError("");
    setIsAuthenticated(true);
  };

  const logout = () => {
    setIsAuthenticated(false);
    setStatus("idle");
    setError("");
    setWarnings([]);
    setSiteId(null);
    setUrl("");
  };

  const landingHero = (
    <div className="auth-shell">
      <div className="ambient-layer ambient-layer--hero" aria-hidden="true" />
      <header className="marketing-nav">
        <div className="brand-mark">
          <span className="brand-mark__icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img" focusable="false">
              <defs>
                <linearGradient id="logoFlow" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="60%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="40" height="40" rx="12" fill="url(#logoFlow)" />
              <path d="M14 17h20" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M14 24h14" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M20 31h14" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="34" cy="24" r="3" fill="#ffffff" />
            </svg>
          </span>
          <div className="brand-mark__text">
            <strong className="brand-mark__title">StyleSync</strong>
            <p className="brand-mark__subtitle">Website-to-design-system intelligence</p>
          </div>
        </div>
        <div className="marketing-nav__actions">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <button className="nav-ghost" onClick={() => setAuthMode("login")}>Log in</button>
          <button className="nav-primary" onClick={() => setAuthMode("signup")}>Sign up</button>
        </div>
      </header>

      <main className="hero-grid">
        <section className="hero-copy">
          <div className="eyebrow">Design system extraction, simplified</div>
          <h1>Turn any website into a clear, editable, exportable design system.</h1>
          <p>
            StyleSync reads a website’s visual language, distills the style into tokens, and gives you
            a high-end workspace to refine, lock, preview, and export it.
          </p>

          <div className="hero-cta">
            <button className="nav-primary" onClick={() => setAuthMode("signup")}>Start free</button>
            <button className="nav-ghost" onClick={() => setAuthMode("login")}>Continue with account</button>
          </div>

          <div className="hero-stats">
            {heroStats.map((stat) => (
              <div key={stat.label} className="hero-stat-card">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="auth-card">
          <div className="auth-tabs">
            <button
              className={authMode === "login" ? "auth-tab is-active" : "auth-tab"}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              className={authMode === "signup" ? "auth-tab is-active" : "auth-tab"}
              onClick={() => setAuthMode("signup")}
            >
              Sign up
            </button>
          </div>

          {authMode === "login" ? (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <h2>Welcome back</h2>
              <p>Sign in to analyze sites and continue your design system work.</p>
              <label>
                Email
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="you@company.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Enter your password"
                />
              </label>
              {authError && <div className="auth-error">{authError}</div>}
              <button className="nav-primary auth-submit" type="submit">Log in</button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleSignupSubmit}>
              <h2>Create your account</h2>
              <p>Sign up to start extracting and organizing design systems from websites.</p>
              <label>
                Full name
                <input
                  type="text"
                  value={signupForm.name}
                  onChange={(event) => setSignupForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Alex Morgan"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={signupForm.email}
                  onChange={(event) => setSignupForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="you@company.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={signupForm.password}
                  onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Create a strong password"
                />
              </label>
              {authError && <div className="auth-error">{authError}</div>}
              <button className="nav-primary auth-submit" type="submit">Create account</button>
            </form>
          )}
        </aside>
      </main>

      <section className="content-band" id="features">
        <div className="section-heading">
          <span>What this is about</span>
          <h2>StyleSync gives you a clean bridge from a website’s look to a usable design system.</h2>
        </div>
        <div className="feature-grid">
          {featureCards.map((feature) => (
            <article key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band" id="how-it-works">
        <div className="section-heading">
          <span>How to use</span>
          <h2>A simple flow that gets you from URL to editable tokens quickly.</h2>
        </div>
        <div className="steps-grid">
          {howItWorksSteps.map((item) => (
            <article key={item.step} className="step-card">
              <strong>{item.step}</strong>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band content-band--faq">
        <div className="section-heading">
          <span>Common questions</span>
          <h2>Everything you need to understand the flow before you enter the editor.</h2>
        </div>
        <div className="faq-grid">
          {faqs.map((faq) => (
            <article key={faq.question} className="faq-card">
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="app-shell">
      {isAuthenticated ? (
        <div className="app" style={themeVars}>
          <div className="ambient-layer" aria-hidden="true" />
          <header className="topbar">
            <div>
              <div className="eyebrow eyebrow--small">Workspace</div>
              <h1>StyleSync</h1>
              <p>Turn any website into a living, editable design system.</p>
            </div>
            <div className="topbar-actions">
              <div className="status-pill status-pill--live">Live Preview</div>
              <button className="nav-ghost nav-ghost--small" onClick={logout}>Log out</button>
            </div>
          </header>

          <section className="workspace-intro">
            <div>
              <span className="workspace-intro__tag">Analyze, edit, lock, export</span>
              <h2>Bring a website into the editor and shape it into a coherent design system.</h2>
              <p>
                Paste a URL, inspect the extracted tokens, and use the preview panel to validate the visual language
                before exporting the final output.
              </p>
            </div>
            <div className="workspace-intro__card">
              <strong>What you can do here</strong>
              <ul>
                <li>Analyze a site and extract theme tokens</li>
                <li>Lock colors, typography, and spacing values</li>
                <li>Preview real UI components in context</li>
                <li>Export CSS, JSON, or Tailwind theme files</li>
              </ul>
            </div>
          </section>

          <section className="ingest-panel">
            <label htmlFor="url-input">Website URL</label>
            <div className="ingest-actions">
              <input
                id="url-input"
                type="url"
                value={url}
                placeholder="https://example.com"
                onChange={(e) => setUrl(e.target.value)}
              />
              <button onClick={analyzeSite} disabled={status === "loading"}>Analyze</button>
            </div>
            {status === "loading" && <ParsingSkeleton />}
            {error && (
              <div className="error-box">
                <strong>Scanner feedback:</strong> {error}
                <small>Tip: if this site blocks scanners, lock and edit tokens manually.</small>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="warning-box">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </section>

          <main className="workspace">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <span className="section-kicker">Token Studio</span>
                  <h2>Editable tokens with clear origin labels and lock controls.</h2>
                </div>
                <div className="export-actions">
                  <button onClick={() => exportTokens("css")}>Export CSS</button>
                  <button onClick={() => exportTokens("json")}>Export JSON</button>
                  <button onClick={() => exportTokens("tailwind")}>Export Tailwind</button>
                </div>
              </div>

              <TokenSection title="Color Picker" description="Instantly updates CSS variables and preview components.">
                {colorKeys.map((key) => (
                  <TokenRow
                    key={key}
                    label={key}
                    path={`colors.${key}`}
                    locked={Boolean(lockedTokens[`colors.${key}`])}
                    origin={tokenOrigin(`colors.${key}`)}
                    onToggleLock={toggleLock}
                  >
                    <input
                      type="color"
                      value={tokens.colors[key]}
                      onChange={(e) => updateToken(`colors.${key}`, e.target.value)}
                    />
                    <input
                      className="text-input"
                      value={tokens.colors[key]}
                      onChange={(e) => updateToken(`colors.${key}`, e.target.value)}
                    />
                  </TokenRow>
                ))}
              </TokenSection>

              <TokenSection title="Typography Inspector" description="Adjust families, sizes, and line-height with live specimens.">
                <TokenRow
                  label="Heading Font"
                  path="typography.headingFont"
                  locked={Boolean(lockedTokens["typography.headingFont"])}
                  origin={tokenOrigin("typography.headingFont")}
                  onToggleLock={toggleLock}
                >
                  <input
                    className="text-input"
                    value={tokens.typography.headingFont}
                    onChange={(e) => updateToken("typography.headingFont", e.target.value)}
                  />
                </TokenRow>
                <TokenRow
                  label="Body Font"
                  path="typography.bodyFont"
                  locked={Boolean(lockedTokens["typography.bodyFont"])}
                  origin={tokenOrigin("typography.bodyFont")}
                  onToggleLock={toggleLock}
                >
                  <input
                    className="text-input"
                    value={tokens.typography.bodyFont}
                    onChange={(e) => updateToken("typography.bodyFont", e.target.value)}
                  />
                </TokenRow>
                <TokenRow
                  label="Base Size"
                  path="typography.baseSize"
                  locked={Boolean(lockedTokens["typography.baseSize"])}
                  origin={tokenOrigin("typography.baseSize")}
                  onToggleLock={toggleLock}
                >
                  <input
                    className="text-input"
                    value={tokens.typography.baseSize}
                    onChange={(e) => updateToken("typography.baseSize", e.target.value)}
                  />
                </TokenRow>
                <TokenRow
                  label="Line Height"
                  path="typography.lineHeight"
                  locked={Boolean(lockedTokens["typography.lineHeight"])}
                  origin={tokenOrigin("typography.lineHeight")}
                  onToggleLock={toggleLock}
                >
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.05"
                    value={tokens.typography.lineHeight}
                    onChange={(e) => updateToken("typography.lineHeight", Number(e.target.value))}
                  />
                  <span>{tokens.typography.lineHeight}</span>
                </TokenRow>
              </TokenSection>

              <TokenSection title="Spacing Visualizer" description="Drag to tune spacing rhythm with immediate feedback.">
                <TokenRow
                  label="Base Unit"
                  path="spacing.unit"
                  locked={Boolean(lockedTokens["spacing.unit"])}
                  origin={tokenOrigin("spacing.unit")}
                  onToggleLock={toggleLock}
                >
                  <input
                    type="range"
                    min="4"
                    max="16"
                    step="1"
                    value={tokens.spacing.unit}
                    onChange={(e) => {
                      const unit = Number(e.target.value);
                      updateToken("spacing.unit", unit);
                      updateToken("spacing.scale", [0, unit / 2, unit, unit * 2, unit * 3, unit * 4, unit * 6, unit * 8].map((x) => Math.round(x)));
                    }}
                  />
                  <strong>{tokens.spacing.unit}px</strong>
                </TokenRow>
                <div className="spacing-bars">
                  {tokens.spacing.scale.map((value, idx) => (
                    <div key={`${value}-${idx}`} className="spacing-bar-wrap">
                      <div className="spacing-bar" style={{ width: `${Math.max(16, value * 4)}px` }} />
                      <span>{value}px</span>
                    </div>
                  ))}
                </div>
              </TokenSection>
            </section>

            <section className="panel panel--preview">
              <div className="panel-header">
                <div>
                  <span className="section-kicker">Live Preview</span>
                  <h2>Component states rendered with the active theme.</h2>
                </div>
                <span className="preview-speed">Updates in real time (&lt;100ms)</span>
              </div>

              <div className="preview-grid">
                <article className="preview-card">
                  <h3>Buttons</h3>
                  <div className="button-row">
                    <button className="btn btn-primary">Primary</button>
                    <button className="btn btn-secondary">Secondary</button>
                    <button className="btn btn-ghost">Ghost</button>
                  </div>
                </article>

                <article className="preview-card">
                  <h3>Input States</h3>
                  <input className="field" placeholder="Default input" />
                  <input className="field field-focus" value="Focused state" readOnly />
                  <input className="field field-error" value="Error state" readOnly />
                </article>

                <article className="preview-card">
                  <h3>Cards & Elevation</h3>
                  <div className="mini-cards">
                    <div className="mini-card">Soft Shadow</div>
                    <div className="mini-card mini-card-strong">Strong Shadow</div>
                  </div>
                </article>

                <article className="preview-card">
                  <h3>Type Scale</h3>
                  <div className="type-scale">
                    <h1>Heading 1</h1>
                    <h2>Heading 2</h2>
                    <h3>Heading 3</h3>
                    <p>Body text specimen with readable line height and width.</p>
                    <span>Caption text for secondary context.</span>
                  </div>
                </article>
              </div>
            </section>
          </main>
        </div>
      ) : (
        landingHero
      )}
    </div>
  );
}

function TokenSection({ title, description, children }) {
  return (
    <section className="token-section">
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="token-section-content">{children}</div>
    </section>
  );
}

function TokenRow({ label, path, origin, locked, onToggleLock, children }) {
  return (
    <div className={`token-row token-row--${origin}`}>
      <div className="token-meta">
        <span>{label}</span>
        <small>{origin}</small>
      </div>
      <div className="token-input">{children}</div>
      <button 
        className={`lock-btn ${locked ? "is-locked" : ""}`} 
        onClick={() => onToggleLock(path)}
        title={locked ? "Unlock Token" : "Lock Token"}
      >
        <span>{locked ? "🔒" : "🔓"}</span>
      </button>
    </div>
  );
}

function ParsingSkeleton() {
  return (
    <div className="skeleton-wrap" aria-label="Parsing DOM tree">
      <div className="skeleton-title">Parsing DOM tree...</div>
      {[...Array(5)].map((_, idx) => (
        <div className="skeleton-line" key={`sk-${idx}`} style={{ width: `${92 - idx * 12}%` }} />
      ))}
    </div>
  );
}

function getByPath(obj, path) {
  return path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((acc, part) => {
    if (typeof acc[part] !== "object" || acc[part] === null) {
      acc[part] = {};
    }
    return acc[part];
  }, obj);
  target[last] = value;
}

export default App;