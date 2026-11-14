"use client";
// STAFF LOGIN — part of the ops website (ink theme).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Btn, Card, Field, Loader, Logo } from "@/components/ui";
import { callApi, getSession, saveSession } from "@/lib/auth";

export default function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in as staff? Straight to the right console.
  useEffect(() => {
    const session = getSession();
    if (session?.user.role === "staff") {
      router.replace(session.user.staffRole === "admin" ? "/console/team" : "/console");
    }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await callApi("/api/auth/login", { email, password, expects: "staff" });
    setBusy(false);
    if (res.ok) {
      saveSession({ token: res.data.token, user: res.data.user });
      // admins land on their own command center, interviewers on the console
      router.push(res.data.user.staffRole === "admin" ? "/console/team" : "/console");
    } else {
      setErr(res.error ?? "Login failed.");
    }
  }

  return (
    <main className="theme-ink grid min-h-screen place-items-center grid-ink">
      <Card className="w-full max-w-md p-10 rise">
        <div className="mb-8 flex items-center gap-3">
          <Logo />
          <div>
            <div className="display text-sm" style={{ color: "var(--color-lime)" }}>GRIT OPS SITE</div>
            <div className="font-mono text-[10px]" style={{ letterSpacing: "0.16em", opacity: 0.5 }}>INTERVIEWS · INTEGRITY</div>
          </div>
        </div>

        <h1 className="display text-3xl" style={{ color: "var(--color-paper)" }}>Staff console access</h1>
        <p className="mt-2 text-sm" style={{ opacity: 0.6 }}>Interviewers land on their console. Admins land on the command center.</p>

        {busy ? (
          <div className="my-10">
            <Loader compact label="Verifying your credentials" />
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Work email">
              <input className="input" type="email" required autoComplete="email" placeholder="name@niat.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className="input" type="password" required autoComplete="current-password" placeholder="Your GRIT password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {err && <Alert kind="err">{err}</Alert>}
            <Btn type="submit" className="w-full">Enter console →</Btn>
          </form>
        )}

        <div className="mt-6 font-mono text-[10px]" style={{ letterSpacing: "0.12em", opacity: 0.5 }}>
          INTERVIEWER: kavya.rao@niat.edu.in · ADMIN: ops@niat.edu.in · PASSWORD: grit2026
        </div>

        <div className="mt-6 flex justify-between text-xs">
          <Link href="/" style={{ opacity: 0.6 }}>← Back</Link>
          <Link href="/login/student">Student entrance →</Link>
        </div>
      </Card>
    </main>
  );
}
