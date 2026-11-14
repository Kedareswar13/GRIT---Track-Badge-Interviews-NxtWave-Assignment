"use client";
// STUDENT LOGIN — part of the student website (paper theme).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Btn, Card, Field, Loader, Logo } from "@/components/ui";
import { callApi, getSession, saveSession } from "@/lib/auth";

export default function StudentLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in as a student? Straight to the dashboard.
  useEffect(() => {
    const session = getSession();
    if (session?.user.role === "student") router.replace("/portal");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await callApi("/api/auth/login", { email, password, expects: "student" });
    setBusy(false);
    if (res.ok) {
      saveSession({ token: res.data.token, user: res.data.user });
      router.push("/portal");
    } else {
      setErr(res.error ?? "Login failed.");
    }
  }

  return (
    <main className="theme-paper grid min-h-screen place-items-center grid-paper">
      <Card className="w-full max-w-md p-10 rise">
        <div className="mb-8 flex items-center gap-3">
          <Logo />
          <div>
            <div className="display text-sm" style={{ color: "#6d8a1a" }}>GRIT STUDENT SITE</div>
            <div className="font-mono text-[10px]" style={{ letterSpacing: "0.16em", opacity: 0.55 }}>TRACK BADGE INTERVIEWS</div>
          </div>
        </div>

        <h1 className="display text-3xl">Log in to your dashboard</h1>
        <p className="mt-2 text-sm" style={{ opacity: 0.6 }}>Use your NIAT email and password. New here? Your dashboard unlocks once you clear every track skill.</p>

        {busy ? (
          <div className="my-10">
            <Loader compact label="Verifying your credentials" />
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="NIAT email">
              <input className="input" type="email" required autoComplete="email" placeholder="you@niat.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className="input" type="password" required autoComplete="current-password" placeholder="Your GRIT password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {err && <Alert kind="err">{err}</Alert>}
            <Btn type="submit" className="w-full">Log in →</Btn>
          </form>
        )}

        <div className="mt-6 font-mono text-[10px]" style={{ letterSpacing: "0.12em", opacity: 0.5 }}>
          DEMO: aarav.s@niat.edu.in · PASSWORD: grit2026
        </div>

        <div className="mt-6 flex justify-between text-xs">
          <Link href="/" style={{ opacity: 0.6 }}>← Back</Link>
          <Link href="/login/admin">Staff entrance →</Link>
        </div>
      </Card>
    </main>
  );
}
