"use client";
// INTERVIEWER CONSOLE — ops website (ink theme).
// Availability manager · daily schedule with outcome recording · AI assist.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, BackLink, Btn, Card, Chip, ExitButton, Loader, Logo, Overline, Skeleton, StatePill } from "@/components/ui";
import { callApi, getSession } from "@/lib/auth";
import { useSnapshot } from "@/lib/useSnapshot";

function todayLocalStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function InterviewerConsole() {
  const router = useRouter();
  const { snap, loading, refresh } = useSnapshot();
  const [staffId, setStaffId] = useState("");
  const [tab, setTab] = useState<"schedule" | "availability" | "history">("schedule");
  const [dateFilter, setDateFilter] = useState(todayLocalStr());
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) router.replace("/login/admin");
    // Defense in depth: a student session must never sit on the ops console.
    else if (session.user.role !== "staff") router.replace("/portal");
    else setStaffId(session.user.id);
  }, [router]);

  const me = useMemo(() => snap?.staff.find((s) => s.id === staffId), [snap, staffId]);
  const mySlots = useMemo(
    () => (snap?.slots ?? []).filter((s) => s.interviewerId === staffId).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [snap, staffId]
  );
  const daySlots = useMemo(() => mySlots.filter((s) => s.date === dateFilter && s.status === "open"), [mySlots, dateFilter]);
  const dayInterviews = useMemo(
    () => (snap?.interviews ?? []).filter((iv) => daySlots.some((s) => s.id === iv.slotId) && iv.status === "booked"),
    [snap, daySlots]
  );
  const pendingRequests = useMemo(
    () => (snap?.interviews ?? []).filter((iv) => iv.status === "booked" && !iv.meetingLink),
    [snap]
  );
  const pastInterviews = useMemo(
    () => (snap?.interviews ?? []).filter((iv) => iv.status !== "booked")
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime)),
    [snap]
  );

  if (loading || !snap) return <Shell><Loader label="Loading console" /></Shell>;

  return (
    <Shell>
      {/* Sticky chrome — exit + entry nav always reachable */}
      <header className="sticky-head -mx-6 px-6 py-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="display text-sm" style={{ color: "var(--color-lime)" }}>GRIT OPS SITE</div>
            <div className="font-mono text-[10px]" style={{ letterSpacing: "0.16em", opacity: 0.5 }}>INTERVIEWER CONSOLE</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {me?.role === "admin" && <Link href="/console/team" className="btn btn-primary" style={{ padding: "7px 14px", fontSize: 13 }}>Ops desk <span className="arrow">→</span></Link>}
          <span className="font-mono text-[10px]" style={{ opacity: 0.5 }}>{me?.name}</span>
          <ExitButton to="/login/admin" />
        </div>
      </header>
      <BackLink href="/" label="Ops home" />
      <div className="h-4" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {(["schedule", "availability", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="font-mono text-[10px] px-4 py-2 switch-tab"
            style={{
              letterSpacing: "0.14em",
              clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)",
              ...(tab === t ? { background: "var(--color-lime)", color: "var(--color-ink)" } : { background: "var(--color-ink-3)", color: "var(--color-paper-2)" }),
            }}>
            {t === "schedule" ? `DAILY SCHEDULE · ${dayInterviews.length}` : t === "history" ? `PAST ACTIVITY · ${pastInterviews.length}` : "MY AVAILABILITY"}
          </button>
        ))}
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="input" style={{ width: "auto", padding: "7px 12px" }}>
          {[...new Set([todayLocalStr(), ...snap.slots.filter((s) => s.status === "open").map((s) => s.date)])].sort().map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {pendingRequests.length > 0 && (
          <Chip color="#ffb224">{pendingRequests.length} booking request(s) awaiting your confirmation</Chip>
        )}
      </div>

      {flash && <div className="mb-5 toast"><Alert kind={flash.kind}>{flash.text}</Alert></div>}

      {tab === "availability"
        ? <Availability me={me} mySlots={mySlots} refresh={refresh} setFlash={setFlash} />
        : tab === "history"
          ? <History snap={snap} me={me} pastInterviews={pastInterviews} />
          : <Schedule snap={snap} me={me} dayInterviews={dayInterviews} dateFilter={dateFilter} refresh={refresh} setFlash={setFlash} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="theme-ink grid-ink min-h-screen page-enter"><div className="mx-auto max-w-5xl px-6 py-8">{children}</div></main>;
}

type Flash = (f: { kind: "ok" | "err"; text: string }) => void;

function Availability({ me, mySlots, refresh, setFlash }: any) {
  const [date, setDate] = useState(todayLocalStr());
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("10:30");
  const [capacity, setCapacity] = useState(1);
  const [busy, setBusy] = useState(false);

  async function addSlot() {
    setBusy(true);
    const res = await callApi("/api/slots", { interviewerId: me.id, date, startTime: start, endTime: end, capacity });
    setBusy(false);
    if (res.ok) { setFlash({ kind: "ok", text: `Slot published: ${date} ${start}–${end}. Students can book it now.` }); refresh(); }
    else setFlash({ kind: "err", text: res.error });
  }

  async function cancelSlot(slotId: string) {
    const res = await callApi("/api/slots/cancel", { slotId, actor: me.name });
    if (res.ok) {
      setFlash({ kind: "ok", text: `Slot cancelled. ${res.data.released} student(s) released back to eligible — they'll be nudged to rebook.` });
      refresh();
    } else setFlash({ kind: "err", text: res.error });
  }

  const upcoming = mySlots.filter((s: any) => s.status === "open");

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-6">
        <Overline>Publish availability</Overline>
        <div className="space-y-4">
          <label className="block"><span className="fl">Date</span>
            <input type="date" value={date} min={todayLocalStr()} onChange={(e) => setDate(e.target.value)} className="input" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="fl">Start</span><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></label>
            <label className="block"><span className="fl">End</span><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></label>
          </div>
          <label className="block"><span className="fl">Capacity</span>
            <div className="flex items-center gap-2">
              <Btn variant="ghost" onClick={() => setCapacity((c) => Math.max(1, c - 1))} disabled={capacity <= 1} className="btn-step">−</Btn>
              <span className="tnum display grid place-items-center" style={{ minWidth: 44, height: 40, border: "1.5px solid var(--color-ink-3)", background: "var(--color-ink)" }}>{capacity}</span>
              <Btn variant="ghost" onClick={() => setCapacity((c) => Math.min(4, c + 1))} disabled={capacity >= 4} className="btn-step">+</Btn>
              <span className="font-mono text-[10px]" style={{ opacity: 0.45, letterSpacing: "0.1em" }}>STUDENTS PER SLOT · MAX 4</span>
            </div>
          </label>
          <Btn className="w-full" onClick={addSlot} disabled={busy}>{busy ? "Publishing…" : "Publish slot"}</Btn>
        </div>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <Overline>My open slots · {upcoming.length}</Overline>
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {upcoming.length === 0 && <p className="text-sm" style={{ opacity: 0.5 }}>No open slots — publish one on the left.</p>}
          {upcoming.map((s: any) => (
            <div key={s.id} className="ticket flex items-center justify-between px-4 py-3 text-sm" style={{ background: "var(--color-ink)", border: "1px solid var(--color-ink-3)" }}>
              <div>
                <span className="display">{s.date}</span>
                <span className="ml-3 font-mono text-xs">{s.startTime}–{s.endTime}</span>
                <span className="ml-3"><Chip color={s.bookedCount ? "#a8cc2f" : "#5eead4"}>{s.bookedCount}/{s.capacity} booked</Chip></span>
              </div>
              <Btn variant="danger" onClick={() => cancelSlot(s.id)}>Cancel</Btn>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Schedule({ snap, me, dayInterviews, dateFilter, refresh, setFlash }: any) {
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between p-4">
        <Overline>{dateFilter}</Overline>
        <Chip color="#8fd6ff">{dayInterviews.length} scheduled</Chip>
      </Card>
      {dayInterviews.length === 0 && (
        <Card className="grid place-items-center gap-3 p-14 text-sm" style={{ opacity: 0.6 }}>
          <span>No interviews booked for this day.</span>
          <span className="font-mono text-[10px]" style={{ letterSpacing: "0.14em", opacity: 0.6 }}>SWITCH TO “MY AVAILABILITY” TO PUBLISH SLOTS</span>
        </Card>
      )}
      {dayInterviews.map((iv: any, i: number) => (
        <div key={iv.id} className="rise-stagger" style={{ "--i": i } as React.CSSProperties}>
          <Row snap={snap} me={me} iv={iv} refresh={refresh} setFlash={setFlash} />
        </div>
      ))}
    </div>
  );
}

function Row({ snap, me, iv, refresh, setFlash }: any) {
  const student = snap.students.find((s: any) => s.id === iv.studentId);
  const track = snap.tracks.find((t: any) => t.id === iv.trackId);
  const transcript = (snap.transcripts ?? []).find((t: any) => t.interviewId === iv.id);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<"pass" | "fail" | "retake">("pass");
  const [feedback, setFeedback] = useState("");
  const [ai, setAi] = useState<any>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  async function aiAssist() {
    setAiBusy(true);
    setAi(null);
    const res = await callApi("/api/ai/feedback", { notes: feedback });
    setAiBusy(false);
    if (res.ok) setAi(res.data.feedback);
    else setFlash({ kind: "err", text: res.error });
  }

  async function submitOutcome() {
    setBusy(true);
    const res = await callApi("/api/outcomes", { interviewId: iv.id, result, feedback, recordedBy: me.name, aiAssisted: Boolean(ai) });
    setBusy(false);
    if (res.ok) { setOpen(false); setAi(null); refresh(); setFlash({ kind: "ok", text: `Outcome recorded: ${result.toUpperCase()} for ${iv.studentName}.` }); }
    else setFlash({ kind: "err", text: res.error });
  }

  async function markNoShow() {
    const res = await callApi("/api/interviews", { action: "no_show", interviewId: iv.id, actor: me.name });
    if (res.ok) { refresh(); setFlash({ kind: "ok", text: `${iv.studentName} marked as no-show.` }); }
    else setFlash({ kind: "err", text: res.error });
  }

  async function acceptRequest() {
    setBusy(true);
    const res = await callApi("/api/interviews", { action: "accept", interviewId: iv.id, actor: me.name });
    setBusy(false);
    if (res.ok) { refresh(); setFlash({ kind: "ok", text: `Request accepted — video room sent to ${iv.studentName}: ${res.data.meetingLink}` }); }
    else setFlash({ kind: "err", text: res.error });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="display text-lg">{iv.studentName}</span>
            <StatePill state={student?.effectiveState ?? "ELIGIBLE"} />
            <Chip color="#a8cc2f">{iv.startTime}–{iv.endTime}</Chip>
            {track && <Chip color="#8fd6ff">{track.badgeName}</Chip>}
            {!iv.meetingLink && <Chip color="#ffb224">⏳ booking request — link not sent</Chip>}
          </div>
          <div className="mt-1 font-mono text-[10px]" style={{ opacity: 0.45 }}>
            {iv.meetingLink ?? "no video room yet · accept the request to generate one"} · ATTEMPT {student?.attempts} · {student?.noShowCount} PRIOR NO-SHOW(S)
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!iv.meetingLink && (
            <Btn onClick={acceptRequest} disabled={busy} className="pop-in">
              {busy ? "Generating room…" : "✅ Accept & send video link"}
            </Btn>
          )}
          <Btn variant="ghost" onClick={markNoShow}>No-show</Btn>
          <Btn variant="success" onClick={() => setOpen(!open)}>{open ? "Close" : "Record outcome"}</Btn>
        </div>
      </div>

      {iv.meetingLink && (
        <div className="mt-3 p-3 text-xs font-mono rise" style={{ background: "rgba(94,234,212,.07)", border: "1px dashed rgba(94,234,212,.35)" }}>
          <span style={{ color: "var(--color-mint)" }}>VIDEO ROOM LIVE →</span>{" "}
          <a href={iv.meetingLink} target="_blank" rel="noreferrer" style={{ color: "#8fd6ff", textDecoration: "underline" }}>{iv.meetingLink}</a>
          <span style={{ opacity: 0.45 }}> · visible to {iv.studentName} on their dashboard</span>
        </div>
      )}

      {open && (
        <div className="mt-5 space-y-4" style={{ borderTop: "1px dashed var(--color-ink-3)", paddingTop: 20 }}>
          <div className="flex flex-wrap gap-2">
            {(["pass", "fail", "retake"] as const).map((r) => (
              <button key={r} onClick={() => setResult(r)}
                className="font-mono text-[10px] px-4 py-2" style={{
                  letterSpacing: "0.14em",
                  clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)",
                  ...(result === r
                    ? { background: r === "pass" ? "var(--color-mint)" : r === "fail" ? "var(--color-coral)" : "var(--color-ember)", color: "var(--color-ink)" }
                    : { background: "var(--color-ink-3)", color: "var(--color-paper-2)" }),
                }}>
                {r === "pass" ? "✓ PASS" : r === "fail" ? "✕ FAIL" : "↻ RETAKE LATER"}
              </button>
            ))}
          </div>
          <label className="block"><span className="fl">Interview notes (raw)</span>
            <textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="Paste your raw notes — the AI will structure them; you still make the call."
              className="input" /></label>
          {transcript && (
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant="ghost" onClick={() => setFeedback(transcript.notes)}>📋 Load sample transcript</Btn>
              <span className="font-mono text-[10px]" style={{ opacity: 0.45, letterSpacing: "0.1em" }}>
                MOCK TRANSCRIPT FROM THE GOLDEN DATASET · {transcript.title.toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" onClick={aiAssist} disabled={aiBusy || feedback.trim().length < 20}>
              {aiBusy ? "🤖 Local model thinking…" : "✨ AI assist — structure my notes"}
            </Btn>
            <Btn onClick={submitOutcome} disabled={busy || feedback.trim().length < 10}>{busy ? "Saving…" : "Submit outcome"}</Btn>
          </div>
          <p className="font-mono text-[10px]" style={{ opacity: 0.4, letterSpacing: "0.1em" }}>
            AI IS ADVISORY ONLY · LOCAL OLLAMA · YOUR NOTES NEVER LEAVE THIS MACHINE
          </p>
          {ai && (
            <div className="space-y-2 p-4" style={{ border: "1px dashed var(--color-lime-deep)", background: "rgba(215,249,92,.05)" }}>
              <div className="flex items-center gap-3">
                <Chip color="#a8cc2f">Model suggestion</Chip>
                <span className="font-mono text-[10px]" style={{ color: "var(--color-lime)" }}>RECOMMENDATION: {String(ai.recommendation).toUpperCase()}</span>
              </div>
              <p className="text-sm" style={{ opacity: 0.85 }}>{ai.summary}</p>
              {ai.strengths?.length > 0 && <p className="text-xs" style={{ color: "var(--color-mint)" }}>+ {ai.strengths.join(" · ")}</p>}
              {ai.concerns?.length > 0 && <p className="text-xs" style={{ color: "var(--color-coral)" }}>− {ai.concerns.join(" · ")}</p>}
              {ai.suggestedFeedback && (
                <div className="mt-2 p-3 text-sm" style={{ background: "var(--color-ink)" }}>
                  <div className="font-mono text-[10px] mb-1" style={{ opacity: 0.5, letterSpacing: "0.14em" }}>DRAFT FEEDBACK TO STUDENT</div>
                  {ai.suggestedFeedback}
                  <div className="mt-2"><Btn variant="ghost" onClick={() => setFeedback(ai.suggestedFeedback)}>Use this draft</Btn></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── PAST ACTIVITY — completed / cancelled / no-show interviews with outcomes ──

const RESULT_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  pass: { bg: "rgba(94,234,212,.14)", fg: "#14a08c", label: "✓ PASS" },
  fail: { bg: "rgba(255,107,87,.14)", fg: "#e04a36", label: "✕ FAIL" },
  retake: { bg: "rgba(255,138,61,.14)", fg: "#d06a20", label: "↻ RETAKE" },
};

function History({ snap, me, pastInterviews }: any) {
  const [onlyMine, setOnlyMine] = useState(false);
  const list = onlyMine ? pastInterviews.filter((iv: any) => iv.outcome?.recordedBy === me?.name) : pastInterviews;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <Overline>Completed, cancelled &amp; missed interviews — with the outcome you recorded</Overline>
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px]" style={{ letterSpacing: "0.12em", opacity: 0.75 }}>
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          ONLY RECORDED BY ME ({me?.name ?? "—"})
        </label>
      </Card>
      {list.length === 0 && (
        <Card className="grid place-items-center p-14 text-sm" style={{ opacity: 0.6 }}>
          {onlyMine ? "You haven't recorded any outcomes yet." : "No past activity yet."}
        </Card>
      )}
      {list.map((iv: any, i: number) => {
        const o = iv.outcome;
        const rp = o ? RESULT_PILL[o.result] : null;
        return (
          <div key={iv.id} className="rise-stagger" style={{ "--i": i } as React.CSSProperties}>
            <Card className="p-5 row-hover">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="display">{iv.studentName}</span>
                  <Chip color={iv.status === "completed" ? "#5eead4" : iv.status === "no_show" ? "#ffb224" : "#8a8a96"}>{iv.status.toUpperCase()}</Chip>
                  <span className="font-mono text-[11px]" style={{ opacity: 0.5 }}>{iv.date} · {iv.startTime}–{iv.endTime}</span>
                  {rp && <span className="pill" style={{ background: rp.bg, color: rp.fg }}>{rp.label}</span>}
                  {o?.aiAssisted && <Chip color="#a8cc2f">AI-assisted notes</Chip>}
                </div>
                <span className="font-mono text-[10px]" style={{ opacity: 0.4, letterSpacing: "0.1em" }}>
                  {o ? `RECORDED BY ${String(o.recordedBy).toUpperCase()} · ${o.recordedAt}` : iv.status === "cancelled" ? "SLOT RELEASED BACK" : "NO OUTCOME RECORDED"}
                </span>
              </div>
              {o && <p className="mt-3 text-sm" style={{ lineHeight: 1.6, opacity: 0.8 }}>{o.feedback}</p>}
            </Card>
          </div>
        );
      })}
    </div>
  );
}
