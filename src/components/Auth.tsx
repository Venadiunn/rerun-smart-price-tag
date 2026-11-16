import { useState } from "react";
import { ArrowRight, ShieldCheck, MapPin, ScanLine } from "lucide-react";
import { supabase } from "../lib/supabase";
export function Auth({ activation = false }: { activation?: boolean }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(e.currentTarget),
      password = String(form.get("password"));
    try {
      if (activation) {
        const params = new URLSearchParams(location.search),
          token = params.get("token_hash");
        if (token) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: "recovery",
          });
          if (error) throw error;
        }
        if (password !== form.get("confirm"))
          throw new Error("Passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        history.replaceState(null, "", "/");
        setDone(true);
        location.assign("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: String(form.get("email")),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <img src="/rerun-logo.png" alt="ReRun" />
          <span>
            RE<span className="brand-run">RUN</span>
            <small>SMART PRICE TAG</small>
          </span>
        </a>
        <div className="auth-story-copy">
          <span className="eyebrow">A PLACE FOR EVERYTHING.</span>
          <h1>
            Back where
            <br />
            it belongs.
          </h1>
          <p>
            Clear destinations. Confident restocking.
            <br />
            One connected workspace for your store.
          </p>
          <div className="auth-steps">
            <span>
              <ScanLine size={19} /> Scan the tag
            </span>
            <i />
            <span>
              <MapPin size={19} /> Find its place
            </span>
          </div>
        </div>
        <small className="auth-foot">WWT STEM Student Forum · 2026–27</small>
        <div className="abstract-map">
          <div />
          <div />
          <div />
          <div />
          <span>↗</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="secure-icon">
            <ShieldCheck size={25} />
          </div>
          <span className="eyebrow">YOUR STORE, CONNECTED</span>
          <h2>{activation ? "Activate your account" : "Welcome back."}</h2>
          <p>
            {activation
              ? "Choose a private password to finish setting up your staff account."
              : "Sign in to your ReRun staff workspace."}
          </p>
          {!activation && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@store.com"
              />
            </label>
          )}
          <label>
            {activation ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              autoComplete={activation ? "new-password" : "current-password"}
              minLength={activation ? 12 : 1}
              required
              placeholder={
                activation ? "At least 12 characters" : "Enter your password"
              }
            />
          </label>
          {activation && (
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
          )}
          {message && (
            <div className="inline-error" role="alert">
              {message}
            </div>
          )}
          <button className="primary full" disabled={busy || done}>
            {busy
              ? "Please wait…"
              : activation
                ? "Activate account"
                : "Sign in"}
            <ArrowRight size={18} />
          </button>
          <div className="auth-help">
            Staff access is managed by your administrator.
            <br />
            For account activation or password recovery, request a new private
            activation link.
          </div>
        </form>
        <span className="auth-bottom">
          ReRun · Single-store demonstration workspace
        </span>
      </section>
    </div>
  );
}
