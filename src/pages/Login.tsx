import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { FiLogIn } from "react-icons/fi";
import "./Login.css";

const EMPLOYEE_BLOCK_MSG = "Only administrators and managers can sign in here. Employees receive assignments from their manager.";

export function Login() {
  const navigate = useNavigate();
  const { signIn, signOut, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBlockMessage(null);
    setSubmitting(true);
    try {
      const u = await signIn(email, password);
      if (u.role === "employee") {
        signOut().catch(() => {});
        setBlockMessage(EMPLOYEE_BLOCK_MSG);
        return;
      }
      const path = u.role === "admin" ? "/admin" : "/manager";
      navigate(path, { replace: true });
    } catch (err) {
      // signIn already sets error or throws
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = blockMessage || error;

  return (
    <div className="login-page">
      <div className="login-page__layout">
        <div className="login-card">
          <div className="login-header">
            <img src="/assets/logo.png" alt="Agenta" className="login-header__logo" />
            <p>Sign in (admin or manager)</p>
          </div>
          <form onSubmit={handleSubmit} className="login-form">
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </label>
            {displayError && <div className="login-error">{displayError}</div>}
            <button type="submit" disabled={submitting} className="login-submit">
              {React.createElement(FiLogIn as any)} Sign in
            </button>
            <p className="login-footer">
            </p>
          </form>
        </div>
        <div className="login-page__img-wrap">
          <img src="/assets/loading_page_img.jpeg" alt="" className="login-page__img" />
        </div>
      </div>
    </div>
  );
}
