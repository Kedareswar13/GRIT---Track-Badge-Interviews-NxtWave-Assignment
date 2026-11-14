"use client";
// OPS DESK — interview team console (admin role). Booked vs not-booked,
// AI nudges for non-bookers, badge nullification, journey table, audit log.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, BackLink, Btn, BigNum, Card, Chip, ExitButton, Loader, Logo, Overline, StatePill } from "@/components/ui";
import { callApi, getSession } from "@/lib/auth";
import { useSnapshot } from "@/lib/useSnapshot";

export default function TeamConsole() {
  const router = useRouter();
  const { snap, loading, refresh } = useSnapshot();
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) router.replace("/login/admin");
    else if (session.user.staffRole !== "admin") router.replace("/console"); // admins only
  }, [router]);

  const eligible = useMemo(() => (snap?.students ?? []).filter((s) => ["ELIGIBLE", "BOOKED"].includes(s.effectiveState)), [snap]);
  const notBooked = eligible.filter((s) => s.effectiveState === "ELIGIBLE");
  const booked = eligible.filter((s) => s.effectiveState === "BOOKED");

  if (loading || !snap) {
    return <main className="theme-ink grid-ink min-h-screen"><Loader label="Loading ops desk" /></main>;
  }

  return (
    <main className="theme-ink grid-ink min-h-screen page-enter">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="sticky-head -mx-6 px-6 py-4 mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="display text-sm" style={{ color: "var(--color-lime)" }}>GRIT OPS SITE</div>
              <div className="font-mono text-[10px]" style={{ letterSpacing: "0.16em", opacity: 0.5 }}>INTERVIEW TEAM · OPS DESK</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/console" className="btn btn-primary" style={{ padding: "7px 14px", fontSize: 13 }}>Interviewer console <span className="arrow">→</span></Link>
            <ExitButton to="/login/admin" />
          </div>
        </header>
        <BackLink href="/console" label="Interviewer console" />
        <div className="h-4" />

        {flash && <div className="mb-5 toast"><Alert kind={flash.kind}>{flash.text}</Alert></div>}

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <BigNum n={booked.length} label="Booked" />
          <BigNum n={notBooked.length} label="Not booked" />
          <BigNum n={snap.counters.passed} label="Badges active" />
          <BigNum n={snap.counters.retakeDue} label="Retake due" />
          <BigNum n={snap.counters.nullified} label="Nullified" />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-6">
            <Overline>Eligible & booked</Overline>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {booked.length === 0 && <p className="text-sm" style={{ opacity: 0.5 }}>No bookings yet.</p>}
              {booked.map((s, i: number) => (
                <div key={s.id} className="rise-stagger" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ background: "var(--color-ink)", border: "1px solid var(--color-ink-3)" }}>
                    <div>
                      <span className="font-medium">{s.name}</span>
                      <div className="font-mono text-[10px]" style={{ opacity: 0.45 }}>{s.badgeName} · {s.activeInterview.date} {s.activeInterview.startTime} · {s.activeInterview.interviewerName}</div>
                    </div>
                    <StatePill state="BOOKED" />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <Overline>Eligible but not booked · chase list</Overline>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {notBooked.length === 0 && <p className="text-sm" style={{ opacity: 0.5 }}>Every eligible student has booked 🎉</p>}
              {notBooked.map((s) => <NudgeRow key={s.id} student={s} refresh={refresh} setFlash={setFlash} />)}
            </div>
          </Card>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <NullifyPanel snap={snap} refresh={refresh} setFlash={setFlash} />
          <Card className="p-6">
            <Overline>All students · journey states</Overline>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {snap.students.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderBottom: "1px solid var(--color-ink-3)" }}>
                  <span style={{ opacity: 0.85 }}>{s.name}</span>
                  <StatePill state={s.effectiveState} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="mt-5 p-6">
          <Overline>Audit log · every actor decision</Overline>
          <div className="max-h-60 space-y-1 overflow-y-auto font-mono text-[11px]" style={{ opacity: 0.75 }}>
            {snap.log.map((l) => (
              <div key={l.id} className="flex gap-3 py-1" style={{ borderBottom: "1px solid var(--color-ink-3)" }}>
                <span style={{ opacity: 0.45 }}>{new Date(l.at).toLocaleTimeString()}</span>
                <span className="w-44 shrink-0" style={{ color: "var(--color-lime)" }}>{l.action}</span>
                <span>{l.detail}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}

function NudgeRow({ student, refresh, setFlash }: any) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function nudge() {
    setBusy(true);
    setMsg(null);
    const res = await callApi("/api/ai/nudge", { studentId: student.id });
    setBusy(false);
    if (res.ok) setMsg(res.data.message);
    else setFlash({ kind: "err", text: res.error });
  }

  return (
    <div className="px-4 py-3 text-sm" style={{ background: "var(--color-ink)", border: "1px solid var(--color-ink-3)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="font-medium">{student.name}</span>
          <span className="ml-2 font-mono text-[10px]" style={{ opacity: 0.45 }}>{student.badgeName}</span>
        </div>
        <Btn onClick={nudge} disabled={busy}>{busy ? "🤖 Drafting…" : msg ? "↻ Re-draft" : "✨ AI nudge"}</Btn>
      </div>
      {msg && (
        <div className="mt-3 p-3 text-sm" style={{ border: "1px dashed var(--color-lime-deep)", background: "rgba(215,249,92,.05)" }}>
          <div className="font-mono text-[10px] mb-1" style={{ opacity: 0.5, letterSpacing: "0.14em" }}>DRAFT · REVIEW BEFORE SENDING</div>
          {msg}
          <div className="mt-2">
            <Btn variant="ghost" onClick={() => { navigator.clipboard?.writeText(msg); setCopied(true); }}>
              {copied ? "Copied ✓" : "Copy message"}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function NullifyPanel({ snap, refresh, setFlash }: any) {
  const passed = snap.students.filter((s: any) => s.effectiveState === "PASSED");
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [flaggedBy, setFlaggedBy] = useState("Academic Integrity Cell");
  const [busy, setBusy] = useState(false);

  async function nullify() {
    setBusy(true);
    const res = await callApi("/api/badges/nullify", { studentId, reason, flaggedBy });
    setBusy(false);
    if (res.ok) {
      setFlash({ kind: "ok", text: "Badge nullified. The student's dashboard now shows the withdrawal message." });
      setStudentId("");
      setReason("");
      refresh();
    } else setFlash({ kind: "err", text: res.error });
  }

  return (
    <Card className="p-6">
      <Overline>Badge integrity · nullify on confirmed malpractice</Overline>
      {passed.length === 0 ? (
        <p className="text-sm" style={{ opacity: 0.5 }}>No active badges to nullify.</p>
      ) : (
        <div className="space-y-4">
          <label className="block"><span className="fl">Badge holder</span>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input">
              <option value="">— select —</option>
              {passed.map((s: any) => <option key={s.id} value={s.id}>{s.name} · {s.badgeName}</option>)}
            </select>
          </label>
          <label className="block"><span className="fl">Confirmed reason</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Proctor flagged impersonation; review confirmed." className="input" /></label>
          <label className="block"><span className="fl">Actioned by</span>
            <input value={flaggedBy} onChange={(e) => setFlaggedBy(e.target.value)} className="input" /></label>
          <Btn variant="danger" onClick={nullify} disabled={busy || !studentId || reason.trim().length < 5}>
            {busy ? "Processing…" : "Nullify badge"}
          </Btn>
        </div>
      )}
    </Card>
  );
}
