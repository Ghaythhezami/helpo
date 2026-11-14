import { useState, useEffect, type FormEvent } from "react";
import {
  ArrowRight, BarChart3, BookOpen, CircleHelp, GraduationCap, House,
  LayoutTemplate, LogOut, Settings, Sparkles,
} from "lucide-react";
import { useSessionQuery, useSignInMutation, useSignOutMutation, useSignUpMutation } from "./store";

function Logo() {
  return <div className="brand"><div className="brand-icon"><BookOpen size={24} /></div><span>Educator<span className="brand-accent">Helper</span></span></div>;
}

function WelcomeSplash({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 7000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return <div className="welcome-splash">
    <div className="splash-content">
      <div className="robot-animation">
        <svg viewBox="0 0 200 240" className="robot-svg">
          <defs>
            <linearGradient id="robotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: "#a78bfa", stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: "#7c3aed", stopOpacity: 1 }} />
            </linearGradient>
          </defs>

          <circle cx="100" cy="80" r="45" fill="url(#robotGrad)" opacity="0.2" className="glow" />

          <rect x="65" y="45" width="70" height="70" rx="15" fill="#1a1a2e" stroke="#60a5fa" strokeWidth="2" />

          <circle cx="85" cy="65" r="8" fill="#60a5fa" />
          <circle cx="115" cy="65" r="8" fill="#60a5fa" />

          <path d="M 80 80 Q 100 90 120 80" stroke="#00d4ff" strokeWidth="2" fill="none" />

          <g className="mouth-happy">
            <path d="M 85 85 Q 90 88 95 85" stroke="#ff6b6b" strokeWidth="2" fill="none" />
            <path d="M 105 85 Q 110 88 115 85" stroke="#ff6b6b" strokeWidth="2" fill="none" />
          </g>

          <rect x="55" y="115" width="90" height="60" rx="8" fill="#1a1a2e" stroke="#00d4ff" strokeWidth="2" />

          <rect x="70" y="130" width="20" height="30" rx="4" fill="#60a5fa" opacity="0.6" />
          <rect x="110" y="130" width="20" height="30" rx="4" fill="#60a5fa" opacity="0.6" />

          <g className="book-icons">
            <rect x="75" y="145" width="12" height="16" fill="#00d4ff" opacity="0.8" />
            <line x1="81" y1="145" x2="81" y2="161" stroke="#1a1a2e" strokeWidth="1" />
            <rect x="113" y="145" width="12" height="16" fill="#00d4ff" opacity="0.8" />
            <line x1="119" y1="145" x2="119" y2="161" stroke="#1a1a2e" strokeWidth="1" />
          </g>

          <circle cx="45" cy="70" r="8" fill="#fbbf24" opacity="0.7" className="star" />
          <circle cx="155" cy="90" r="6" fill="#fbbf24" opacity="0.7" className="star" />
          <circle cx="160" cy="140" r="5" fill="#fbbf24" opacity="0.6" className="star" />

          <g className="graduation-cap">
            <rect x="80" y="20" width="40" height="5" fill="#7c3aed" />
            <polygon points="100,20 85,15 115,15" fill="#fbbf24" />
            <circle cx="100" cy="22" r="2" fill="#fbbf24" />
            <line x1="102" y1="22" x2="110" y2="18" stroke="#fbbf24" strokeWidth="1.5" />
          </g>

          <g className="thumbs-up" transform="translate(40, 110) scale(0.6)">
            <rect x="0" y="20" width="12" height="30" fill="#d8b4fe" rx="2" />
            <rect x="8" y="5" width="15" height="20" fill="#d8b4fe" rx="3" />
            <circle cx="28" cy="10" r="6" fill="#d8b4fe" />
          </g>
        </svg>
      </div>
      <h1 className="splash-title">HELPO</h1>
      <p className="splash-tagline">Learn • Practice • Achieve</p>
    </div>
  </div>;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") return data.message;
  }
  return "Something went wrong. Please check your connection and try again.";
}

function Login() {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [signIn, signInState] = useSignInMutation();
  const [signUp, signUpState] = useSignUpMutation();
  const pending = signInState.isLoading || signUpState.isLoading;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      if (register) await signUp({ name: name.trim(), email: email.trim(), password }).unwrap();
      else await signIn({ email: email.trim(), password }).unwrap();
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return <main className="login-page">
    <section className="login-story">
      <Logo />
      <div className="story-content">
        <div className="eyebrow"><Sparkles size={15} /> YOUR TEACHING COMPANION</div>
        <h1>More time to teach.<br /><span>More ways to inspire.</span></h1>
        <p>Bring your lessons to life with a little help from your creative teaching companion.</p>
        <div className="story-art" aria-hidden="true"><div className="art-glow" /><div className="art-book"><BookOpen size={94} strokeWidth={1.3} /></div><span className="star star-one">✦</span><span className="star star-two">✦</span><span className="star star-three">✧</span></div>
      </div>
      <div className="story-footer">CREATE <span>•</span> ENGAGE <span>•</span> INSPIRE</div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <div className="mobile-logo"><Logo /></div>
        <div className="welcome-icon"><GraduationCap size={24} /></div>
        <p className="overline">WELCOME TO EDUCATOR HELPER</p>
        <h2>{register ? "Create your account" : "Welcome back!"}</h2>
        <p className="subtitle">{register ? "Let's get your teaching workspace ready." : "Sign in to your teaching workspace."}</p>
        <form onSubmit={submit}>
          {register && <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} placeholder="Your name" /></label>}
          <label>Email address<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="you@school.com" /></label>
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={8} placeholder={register ? "At least 8 characters" : "Enter your password"} /></label>
          {message && <p className="error" role="alert">{message}</p>}
          <button className="primary-button" disabled={pending}>{pending ? "Please wait..." : register ? "Create account" : "Sign in"} <ArrowRight size={17} /></button>
        </form>
        <p className="switch-auth">{register ? "Already have an account?" : "New to Educator Helper?"} <button type="button" onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "Sign in" : "Create an account"}</button></p>
      </div>
      <p className="panel-footer">Made for educators, inspired by learning <span>✦</span></p>
    </section>
  </main>;
}

const navigation = [
  { label: "Home", icon: House, available: true },
  { label: "My Lessons", icon: BookOpen },
  { label: "Results", icon: BarChart3 },
  { label: "Templates", icon: LayoutTemplate },
  { label: "Settings", icon: Settings },
  { label: "Help", icon: CircleHelp },
];

function Dashboard({ user }: { user: { name: string; email: string } }) {
  const [signOut, { isLoading }] = useSignOutMutation();
  const [error, setError] = useState("");
  async function logout() {
    setError("");
    try { await signOut().unwrap(); } catch (cause) { setError(errorMessage(cause)); }
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <Logo />
      <p className="nav-heading">WORKSPACE</p>
      <nav aria-label="Main navigation">{navigation.map(({ label, icon: Icon, available }) =>
        <button key={label} className={`nav-item ${available ? "active" : ""}`} disabled={!available} aria-current={available ? "page" : undefined} title={!available ? "Coming soon" : undefined}><Icon size={18} /><span>{label}</span>{!available && <span className="soon">SOON</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        {error && <p className="sidebar-error" role="alert">{error}</p>}
        <div className="profile"><div className="avatar">{user.name.trim().charAt(0).toUpperCase() || "T"}</div><div className="profile-text"><strong>{user.name}</strong><span>Teacher</span></div><button onClick={logout} disabled={isLoading} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button></div>
      </div>
    </aside>
    <main className="workspace">
      <header className="workspace-header"><span>YOUR WORKSPACE</span><div className="header-user">{user.email}</div></header>
      <div className="workspace-content">
        <div className="greeting"><div className="eyebrow"><Sparkles size={15} /> YOUR CREATIVE SPACE</div><h1>Create. Teach. <span>Inspire.</span></h1><p>Welcome back, {user.name}. Great lessons start here.</p></div>
        <section className="coming-card"><div className="coming-icon"><BookOpen size={35} /></div><div><span className="pill">COMING SOON</span><h2>Your ideas, brought to life.</h2><p>Your lesson workspace is on its way. Soon you'll be able to create and share engaging learning resources with your students.</p></div></section>
        <div className="workspace-note"><Sparkles size={16} /> More tools for your classroom are coming soon.</div>
      </div>
    </main>
  </div>;
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const { data, isLoading, isError, refetch } = useSessionQuery();

  if (!splashDone) return <WelcomeSplash onComplete={() => setSplashDone(true)} />;
  if (isLoading) return <div className="loading">Loading your workspace...</div>;
  if (isError) return <div className="loading"><p>Unable to connect to the server.</p><button onClick={() => refetch()}>Try again</button></div>;
  return data?.user ? <Dashboard user={data.user} /> : <Login />;
}
