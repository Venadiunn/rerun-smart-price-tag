import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Brand } from "./Brand";
import { AppearanceMenu } from "./AppearanceMenu";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
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
        if (password !== form.get("confirm"))
          throw new Error("Passwords do not match.");
        const params = new URLSearchParams(location.search),
          token = params.get("token_hash");
        if (token) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: "recovery",
          });
          if (error) throw error;
          // Keep the authenticated recovery session, but remove the consumed
          // one-time token so a rejected password can be corrected and retried.
          history.replaceState(null, "", "/activate");
        }
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
    <div className="auth-page">
      <div className="auth-topbar">
        <span className="text-xs text-muted-foreground">
          WWT STEM · 2026–27
        </span>
        <AppearanceMenu />
      </div>
      <main className="auth-main">
        <Brand />
        <Card className="panel auth-panel gap-0 py-0 ring-0">
          <header>
            <span className="auth-lock">
              <ShieldCheck size={20} />
            </span>
            <h1>{activation ? "Activate your account" : "Welcome back."}</h1>
            <p>
              {activation
                ? "Choose a private password to finish setting up your staff account."
                : "Sign in to your ReRun staff workspace."}
            </p>
          </header>
          <form className="auth-form" onSubmit={submit}>
            {!activation && (
              <label>
                Email address
                <Input
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
              <Input
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
                <Input
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
            <Button
              type="submit"
              className="primary full"
              disabled={busy || done}
            >
              {busy
                ? "Please wait…"
                : activation
                  ? "Activate account"
                  : "Sign in"}
              <ArrowRight size={18} />
            </Button>
          </form>
          <p className="auth-help">
            Staff access is managed by your administrator. For activation or
            password recovery, request a new private activation link.
          </p>
        </Card>
        <p className="auth-demo-note">
          Single-store demonstration workspace
          <br />
          Fictional inventory · Simulated display updates
        </p>
      </main>
    </div>
  );
}
