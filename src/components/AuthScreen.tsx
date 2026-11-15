import { useState, type FormEvent } from "react";

interface Props {
  onLogin: (username: string, password: string) => Promise<string | null>;
  onSignup: (username: string, password: string) => Promise<string | null>;
}

export default function AuthScreen({ onLogin, onSignup }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const error = await (mode === "login" ? onLogin : onSignup)(username, password);
    if (error) setMessage(error);
    setBusy(false);
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <div className="brand brand--lg">
          Bloxy<span>Bet</span>
        </div>
        <p className="auth__sub">
          {mode === "login" ? "Welcome back. Log in to continue." : "Create your account."}
        </p>

        <label className="field">
          <span>Username</span>
          <input
  className="input"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
  autoComplete="username"
  placeholder="Enter your username"
/>
        </label>

        <label className="field">
          <span>Password</span>
          <input
  className="input"
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  autoComplete={mode === "login" ? "current-password" : "new-password"}
  placeholder="Enter your password"
/>
        </label>

        {message && <p className="auth__error">{message}</p>}

        <button className="btn btn--primary btn--block" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>

        <p className="auth__switch">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
            }}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </form>
    </div>
  );
}
