"use client";
// Landing — two doors: student site and ops site. Physically and visually
// two different websites sharing one brand.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui";

export default function Landing() {
  const [loggedIn, setLoggedIn] = useState<string | null>(null);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("grit.session") ?? "null");
      if (s && Date.now() < (s.exp ?? 0)) setLoggedIn(s.user.role);
    } catch {}
  }, []);

  return (
    <main className="theme-ink min-h-screen">
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="display text-sm" style={{ color: "var(--color-lime)" }}>GRIT</div>
              <div className="font-mono text-[10px]" style={{ letterSpacing: "0.18em", opacity: 0.5 }}>NIAT · SKILLING COMPETITION</div>
            </div>
          </div>
          <span className="stamp" style={{ color: "var(--color-paper-2)" }}>Badge Interviews · Internal</span>
        </header>

        <div className="grid flex-1 md:grid-cols-2">
          {/* ── Door 1: Students ── */}
          <Link href={loggedIn === "student" ? "/portal" : "/login/student"} className="door grid-paper flex flex-col justify-end p-10" style={{ background: "var(--color-paper)", color: "var(--color-ink)" }}>
            <div className="relative">
              <div className="overline mb-4" style={{ color: "#6d8a1a" }}>Student entrance</div>
              <h2 className="display" style={{ fontSize: "clamp(34px, 5vw, 58px)", lineHeight: 1.02 }}>
                Earn your<br />Track Badge.
              </h2>
              <p className="mt-4 max-w-sm text-sm" style={{ opacity: 0.65 }}>
                Book your live badge interview, track your result, and see every message from the GRIT team — all in one place.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <span className="btn btn-primary" style={{ pointerEvents: "none" }}>
                  {loggedIn === "student" ? "Continue to dashboard" : "Student login"} <span className="door-arrow">→</span>
                </span>
              </div>
            </div>
          </Link>

          {/* ── Door 2: Interview team ── */}
          <Link href={loggedIn === "staff" ? "/console" : "/login/admin"} className="door grid-ink flex flex-col justify-end p-10" style={{ background: "var(--color-ink-2)", color: "var(--color-paper)" }}>
            <div className="relative">
              <div className="overline mb-4" style={{ color: "var(--color-lime)" }}>Interview & ops entrance</div>
              <h2 className="display" style={{ fontSize: "clamp(34px, 5vw, 58px)", lineHeight: 1.02, color: "var(--color-paper)" }}>
                Run the<br />interview day.
              </h2>
              <p className="mt-4 max-w-sm text-sm" style={{ opacity: 0.6 }}>
                Publish availability, run your schedule, record outcomes. Ops: track booked vs. not-booked and protect badge integrity.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <span className="btn btn-primary" style={{ pointerEvents: "none" }}>
                  {loggedIn === "staff" ? "Continue to console" : "Staff login"} <span className="door-arrow">→</span>
                </span>
              </div>
            </div>
          </Link>
        </div>

        <footer className="px-8 py-4 font-mono text-[10px]" style={{ letterSpacing: "0.14em", opacity: 0.35, color: "var(--color-paper-2)" }}>
          FRONTEND :3000 · BACKEND :4000 · AI: LOCAL OLLAMA · GOLDEN DATASET VERIFIED BY EVAL PIPELINE
        </footer>
      </div>
    </main>
  );
}
