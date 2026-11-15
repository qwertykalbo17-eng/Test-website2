import { useEffect, useState, type FormEvent } from "react";
import Modal from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<string | null>;
  onSignup: (username: string, password: string) => Promise<string | null>;
}

/** Login / Sign up in one popup, opened from the Login button. */
export default function AuthModal({ open, onClose, onLogin, onSignup }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // start fresh every time the popup opens
  useEffect(() => {
    if (open) {
      setMode("login");
      setUsername("");
      setPassword("");
      setMessage("");
      setBusy(false);
    }
  }, [open]);

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setMessage("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const error = await (mode === "login" ? onLogin : onSignup)(username, password);
    if (error) setMessage(error);
    else onClose(); // logged in
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === "login" ? "Log in" : "Create account"}>
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`auth-tabs__tab ${mode === "login" ? "is-active" : ""}`}
          onClick={() => switchMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={`auth-tabs__tab ${mode === "signup" ? "is-active" : ""}`}
          onClick={() => switchMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>Username</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="Enter your username"
            autoFocus
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
      </form>
    </Modal>
  );
}
