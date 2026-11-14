// Shared presentational components — styled entirely by the GRIT design
// system classes in globals.css (theme-aware via .theme-paper / .theme-ink).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { clearSession } from "@/lib/auth";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div
      style={{
        width: 38, height: 38, background: "var(--color-lime)", color: "var(--color-ink)",
        display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17,
        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)",
        flexShrink: 0,
      }}
      aria-hidden
    >
      G
    </div>
  );
}

export function Card({ children, className = "", hover = false, style }: { children: ReactNode; className?: string; hover?: boolean; style?: React.CSSProperties }) {
  return <div className={`card ${hover ? "card-hover" : ""} ${className}`} style={style}>{children}</div>;
}

export function Overline({ children }: { children: ReactNode }) {
  return <div className="overline mb-3">{children}</div>;
}

export function Btn({
  children, onClick, variant = "primary", disabled, className = "", type = "button",
}: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "accent" | "ghost" | "danger" | "success";
  disabled?: boolean; className?: string; type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${className}`}>
      {children}
    </button>
  );
}

const STATE_PILL: Record<string, { bg: string; fg: string }> = {
  NOT_ELIGIBLE: { bg: "rgba(148,148,160,.14)", fg: "#8a8a96" },
  ELIGIBLE: { bg: "rgba(56,163,216,.14)", fg: "#2b8fc4" },
  BOOKED: { bg: "rgba(168,204,47,.16)", fg: "#6d8a1a" },
  NO_SHOW: { bg: "rgba(255,178,36,.16)", fg: "#b57510" },
  RETAKE_DUE: { bg: "rgba(255,138,61,.16)", fg: "#d06a20" },
  PASSED: { bg: "rgba(94,234,212,.16)", fg: "#14a08c" },
  BADGE_NULLIFIED: { bg: "rgba(255,107,87,.16)", fg: "#e04a36" },
};

const STATE_LABEL: Record<string, string> = {
  NOT_ELIGIBLE: "Not eligible",
  ELIGIBLE: "Eligible",
  BOOKED: "Booked",
  NO_SHOW: "No-show",
  RETAKE_DUE: "Retake due",
  PASSED: "Passed · Badge",
  BADGE_NULLIFIED: "Nullified",
};

export function StatePill({ state }: { state: string }) {
  const c = STATE_PILL[state] ?? STATE_PILL.NOT_ELIGIBLE;
  return (
    <span className="pill" style={{ background: c.bg, color: c.fg }}>
      {STATE_LABEL[state] ?? state}
    </span>
  );
}

export function Chip({ children, color = "#a8cc2f" }: { children: ReactNode; color?: string }) {
  return (
    <span className="pill" style={{ background: "transparent", border: "1.5px solid", borderColor: color, color }}>
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="fl">{label}</span>
      {children}
    </label>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  return (
    <div className="meter">
      <div className="meter-fill" style={{ width: `${max === 0 ? 0 : (value / max) * 100}%` }} />
    </div>
  );
}

export function Alert({ kind, children }: { kind: "ok" | "err" | "info" | "ai"; children: ReactNode }) {
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function BigNum({ n, label }: { n: number; label: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // Count-up animation, tabular numerals keep it jitter-free
    const target = Number(n) || 0;
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return (
    <Card className="p-4 text-center row-hover">
      <div className="display tnum" style={{ fontSize: 30, lineHeight: 1 }}>{shown}</div>
      <div className="mt-2 font-mono text-[10px] uppercase" style={{ letterSpacing: "0.14em", opacity: 0.55 }}>{label}</div>
    </Card>
  );
}

/** Branded page loader — rotating GRIT stamp. */
export function Loader({ label = "Loading", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`grid place-items-center gap-3 ${compact ? "py-2" : "py-20"}`}>
      <div className="loader" style={compact ? { width: 36, height: 36 } : undefined}>
        <div className="loader-ring" />
        <span className="loader-glyph" style={compact ? { fontSize: 13 } : undefined}>G</span>
      </div>
      <div className="font-mono text-[10px]" style={{ letterSpacing: "0.2em", opacity: 0.5 }}>{label.toUpperCase()}…</div>
    </div>
  );
}

/** Skeleton block shimmer — use instead of blank space while data loads. */
export function Skeleton({ h = 80, className = "" }: { h?: number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, borderRadius: 8 }} />;
}

/** Prominent back link — always visible, top-left, impossible to miss. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }}>
      <span className="arrow" style={{ transform: "none" }}>←</span> {label}
    </Link>
  );
}

/**
 * Real logout — clears the session and lands the user on their site's login
 * page (not the landing doors, which would bounce a live session straight
 * back to the dashboard).
 */
export function ExitButton({ to }: { to: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  return (
    <button
      onClick={() => {
        setLeaving(true);
        clearSession();
        router.push(to);
      }}
      className="font-mono text-[10px] px-3 py-2"
      style={{ opacity: 0.7, border: "1.5px solid var(--color-ink-3)", letterSpacing: "0.12em", transition: "opacity .15s ease, border-color .15s ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "var(--color-coral)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.borderColor = "var(--color-ink-3)"; }}
    >
      {leaving ? "BYE…" : "EXIT ↩"}
    </button>
  );
}
