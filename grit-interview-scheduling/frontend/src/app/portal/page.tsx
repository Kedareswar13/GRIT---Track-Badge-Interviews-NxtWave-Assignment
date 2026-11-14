"use client";
// STUDENT PORTAL — the student website's core screen.
// Before/After toggle (Deliverable 4), contest progress, interview status,
// and the three most important messages rendered verbatim from live state.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, BackLink, Btn, Card, ExitButton, Loader, Logo, Meter, Overline, StatePill } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { useSnapshot } from "@/lib/useSnapshot";

export default function StudentPortal() {
  const router = useRouter();
  const { snap, loading } = useSnapshot();
  const [studentId, setStudentId] = useState("");
  const [showAfter, setShowAfter] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (!session) router.replace("/login/student");
    // dashboards are strictly identity-bound: only your own data, no view-as
    else if (session.user.role === "student") setStudentId(session.user.id);
    else router.replace(session.user.role === "staff" && session.user.staffRole === "admin" ? "/console/team" : "/console");
  }, [router]);

  const student = useMemo(() => snap?.students.find((s) => s.id === studentId) ?? null, [snap, studentId]);
  const track = student ? snap!.tracks.find((t) => t.id === student.trackId) : null;

  if (loading || !snap) return <Main><Loader label="Loading your dashboard" /></Main>;

  return (
    <Main>
      {/* ── Site chrome — sticky, always reachable ── */}
      <header className="sticky-head -mx-6 px-6 py-4 mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="display text-sm" style={{ color: "#6d8a1a" }}>GRIT STUDENT SITE</div>
            <div className="font-mono text-[10px]" style={{ letterSpacing: "0.16em", opacity: 0.55 }}>DASHBOARD</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {student?.effectiveState === "ELIGIBLE" && (
            <Link href="/portal/book" className="btn btn-accent" style={{ padding: "7px 14px", fontSize: 13 }}>Book interview <span className="arrow">→</span></Link>
          )}
          {student?.effectiveState === "BOOKED" && (
            <Link href="/portal/book" className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }}>Reschedule <span className="arrow">→</span></Link>
          )}
          <ExitButton to="/login/student" />
        </div>
      </header>
      <BackLink href="/" label="Home" />
      <div className="h-4" />

      {!student ? (
        <Card className="grid place-items-center p-16 text-sm" style={{ opacity: 0.6 }}>Pick a student to view their dashboard.</Card>
      ) : (
        <Dashboard student={student} track={track!} showAfter={showAfter} setShowAfter={setShowAfter} />
      )}
    </Main>
  );
}

function Main({ children }: { children: React.ReactNode }) {
  return (
    <main className="theme-paper grid-paper min-h-screen page-enter">
      <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
    </main>
  );
}

type S = any;

function Dashboard({ student, track, showAfter, setShowAfter }: { student: S; track: any; showAfter: boolean; setShowAfter: (b: boolean) => void }) {
  const nullified = student.effectiveState === "BADGE_NULLIFIED";
  return (
    <div className="space-y-5">
      {/* Identity header */}
      <div className="rise-stagger" style={{ "--i": 0 } as React.CSSProperties}>
        <Card className="p-6 ticket-notch" hover>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Overline>{track.name}</Overline>
              <h1 className="display text-3xl">{student.name}</h1>
              <p className="mt-1 font-mono text-[11px]" style={{ opacity: 0.5 }}>{student.email}</p>
            </div>
            {showAfter && <StatePill state={student.effectiveState} />}
          </div>
        </Card>
      </div>

      {/* Before / After switch — the deliverable, built in */}
      <div className="flex items-center justify-end gap-3">
        <span className="font-mono text-[10px]" style={{ letterSpacing: "0.14em", opacity: 0.55 }}>DASHBOARD FEATURE VIEW:</span>
        <div className="switch flex" style={{ border: "1.5px solid var(--color-ink-3)" }}>
          <button onClick={() => setShowAfter(false)} className="switch-tab font-mono text-[10px] px-3 py-1.5" style={label(!showAfter)}>BEFORE</button>
          <button onClick={() => setShowAfter(true)} className="switch-tab font-mono text-[10px] px-3 py-1.5" style={label(showAfter)}>AFTER</button>
        </div>
      </div>

      {nullified && showAfter && (
        <div className="rise-stagger" style={{ "--i": 1 } as React.CSSProperties}>
          <Alert kind="err">
            <strong>Your badge has been withdrawn.</strong> Reason: {student.nullifiedReason}
            <div className="mt-1 text-xs" style={{ opacity: 0.75 }}>If you believe this is a mistake, contact the Academic Integrity Cell within 7 days.</div>
          </Alert>
        </div>
      )}

      {/* Contest progress — exists in BOTH views */}
      <div className="rise-stagger" style={{ "--i": 2 } as React.CSSProperties}>
        <Card className="p-6">
          <Overline>Track progress · {student.skillsCleared.length}/{track.requiredSkills.length} skills cleared</Overline>
          <Meter value={student.skillsCleared.length} max={track.requiredSkills.length} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {track.requiredSkills.map((sk: string, i: number) => {
              const cleared = student.skillsCleared.includes(sk);
              return (
                <div key={sk} className="row-hover rise-stagger flex items-center justify-between px-3 py-2 text-sm" style={{ "--i": i, border: "1px solid rgba(19,19,24,.1)", background: cleared ? "rgba(168,204,47,.10)" : "transparent" } as React.CSSProperties}>
                  <span>{sk}</span>
                  <span className={`font-mono text-[10px] uppercase ${cleared ? "pop" : ""}`} style={{ letterSpacing: "0.1em", color: cleared ? "#6d8a1a" : "#999", transitionDelay: `${i * 80}ms` }}>{cleared ? "✓ Cleared" : "Pending"}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {showAfter && <InterviewStatus student={student} track={track} />}
      {showAfter && <Messages student={student} track={track} />}
    </div>
  );
}

function label(active: boolean): React.CSSProperties {
  return active
    ? { background: "var(--color-ink)", color: "var(--color-lime)" }
    : { color: "rgba(19,19,24,.5)" };
}

function InterviewStatus({ student, track }: { student: S; track: any }) {
  const iv = student.activeInterview;
  const stamp = <span className="stamp" style={{ color: "#6d8a1a" }}>GRIT · VERIFIED</span>;

  switch (student.effectiveState) {
    case "NOT_ELIGIBLE":
      return (
        <Card className="p-6">
          <Overline>Badge interview · locked</Overline>
          <p className="text-sm" style={{ opacity: 0.7 }}>
            Clear every skill contest to unlock the {track.badgeName} interview. You're at {student.skillsCleared.length}/{track.requiredSkills.length}.
          </p>
        </Card>
      );
    case "ELIGIBLE":
      return (
        <Card className="p-6 rise-stagger" hover>
          <Overline>Badge interview · ready to book</Overline>
          <p className="text-sm">You've cleared every skill for the <strong>{track.badgeName}</strong> 🎯</p>
          <p className="mt-1 text-sm" style={{ opacity: 0.6 }}>Pick a slot with an available interviewer to earn your badge.</p>
          <div className="mt-5 flex items-center gap-3">
            <Link href={`/portal/book`}><Btn>Book your interview slot →</Btn></Link>
            {stamp}
          </div>
        </Card>
      );
    case "BOOKED":
      return (
        <Card className="p-6 ticket rise-stagger">
          <Overline>Badge interview · confirmed</Overline>
          <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Detail k="Date" v={iv.date} />
            <Detail k="Time" v={`${iv.startTime}–${iv.endTime}`} />
            <Detail k="Interviewer" v={iv.interviewerName} />
            <Detail k="Join link" v={
              iv.meetingLink ? (
                <a href={iv.meetingLink} target="_blank" rel="noreferrer" className="font-mono text-[13px]" style={{ color: "#2b7cc4", textDecoration: "underline" }}>Open video room ↗</a>
              ) : (
                <span className="inline-flex items-center gap-2 font-mono text-[11px]" style={{ color: "#b57510" }}>
                  <span className="live-dot" style={{ color: "#d06a20" }} />
                  AWAITING INTERVIEWER CONFIRMATION
                </span>
              )
            } mono />
          </div>
          <p className="mt-4 text-xs" style={{ opacity: 0.55 }}>
            {iv.meetingLink
              ? <>Your video room is ready — it opens 10 minutes before your slot. Cancel or <Link href="/portal/book" style={{ textDecoration: "underline" }}>reschedule</Link> from here — no penalty if it's 4+ hours ahead.</>
              : "Your interviewer will confirm the request and a video room link will appear here automatically."}
          </p>
        </Card>
      );
    case "RETAKE_DUE":
      return (
        <Card className="p-6">
          <Overline>Badge interview · not cleared this time</Overline>
          {student.latestOutcome && <p className="text-sm" style={{ opacity: 0.8 }}>{student.latestOutcome.feedback}</p>}
          <p className="mt-3 text-sm" style={{ color: "#d06a20" }}>{student.stateNote}</p>
          <p className="mt-1 font-mono text-[10px]" style={{ letterSpacing: "0.1em", opacity: 0.5 }}>ATTEMPT {student.attempts} OF 3</p>
        </Card>
      );
    case "NO_SHOW":
      return (
        <Card className="p-6">
          <Overline>Badge interview · missed</Overline>
          <p className="text-sm">{student.stateNote}</p>
          {student.noShowCount >= 2 && (
            <p className="mt-2 text-xs" style={{ color: "#b57510" }}>Two missed interviews lock rebooking for 14 days — set a reminder this time.</p>
          )}
        </Card>
      );
    case "PASSED":
      return (
        <Card className="p-6" hover>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Overline>Badge earned</Overline>
              <h3 className="display text-2xl" style={{ color: "#14a08c" }}>{track.badgeName} 🏆</h3>
              <p className="mt-1 text-sm" style={{ opacity: 0.65 }}>Cleared on {student.badgeAwardedAt} · live on your GRIT profile.</p>
            </div>
            {stamp}
          </div>
        </Card>
      );
    default:
      return null;
  }
}

function Detail({ k, v, mono = false }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase" style={{ letterSpacing: "0.14em", opacity: 0.5 }}>{k}</div>
      <div className={mono ? "font-mono text-[13px]" : "text-[15px] font-medium"}>{v}</div>
    </div>
  );
}

// ── Deliverable 3: the 3 most important student messages, verbatim ──
function Messages({ student, track }: { student: S; track: any }) {
  const iv = student.activeInterview;
  const msgs: { title: string; body: string }[] = [];

  if (student.effectiveState === "ELIGIBLE") {
    msgs.push({
      title: "🎯 Action needed: book your badge interview",
      body: `Hi ${student.name.split(" ")[0]}, you've cleared all ${track.requiredSkills.length} skills for the ${track.badgeName}! Book your 30-minute live interview from your dashboard to earn your badge. Slots are limited — pick one today.`,
    });
  }
  if (student.effectiveState === "BOOKED" && iv) {
    msgs.push({
      title: "✅ Interview confirmed",
      body: `Your ${track.badgeName} interview is booked for ${iv.date} at ${iv.startTime} with ${iv.interviewerName}. The join link appears here 10 minutes before your slot. Keep your project and code editor ready. All the best!`,
    });
  }
  if (student.effectiveState === "PASSED") {
    msgs.push({
      title: "🎉 Congratulations — badge earned!",
      body: `${student.name.split(" ")[0]}, you cleared your ${track.badgeName} interview! Your badge is now live on your GRIT profile. Share it with your cohort and keep the momentum going.`,
    });
  }
  if (student.effectiveState === "RETAKE_DUE") {
    msgs.push({
      title: "🔄 Your retake window",
      body: `This interview round wasn't a pass — but you can rebook from ${student.retakeAvailableFrom}. You have ${3 - student.attempts} attempt(s) left. Review the interviewer's note on your dashboard and come back stronger.`,
    });
  }
  if (student.effectiveState === "NO_SHOW") {
    msgs.push({
      title: "⚠️ You missed your interview",
      body: student.noShowCount >= 2
        ? `You missed your interview again. Rebooking is locked until ${student.retakeAvailableFrom} to give other students slot access. Write to grit-support@niat.edu.in if this was unavoidable.`
        : `You missed your scheduled interview, but you can rebook a new slot right away from your dashboard. Please reschedule properly next time — no-shows block slots for your peers.`,
    });
  }
  if (student.effectiveState === "BADGE_NULLIFIED") {
    msgs.push({
      title: "🚨 Badge withdrawn",
      body: `Your ${track.badgeName} has been withdrawn following a malpractice review (${student.nullifiedReason}). You may appeal within 7 days by writing to the Academic Integrity Cell.`,
    });
  }

  if (!msgs.length) return null;
  return (
    <div className="rise-stagger" style={{ "--i": 3 } as React.CSSProperties}>
      <Card className="p-6">
        <Overline>Messages · exactly as the student sees them</Overline>
        <div className="space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className="p-4 ticket rise-stagger row-hover" style={{ "--i": i, border: "1px solid rgba(19,19,24,.12)", background: "var(--color-paper-2)" } as React.CSSProperties}>
              <div className="text-sm font-semibold">{m.title}</div>
              <p className="mt-1 text-sm" style={{ lineHeight: 1.6, opacity: 0.8 }}>{m.body}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
