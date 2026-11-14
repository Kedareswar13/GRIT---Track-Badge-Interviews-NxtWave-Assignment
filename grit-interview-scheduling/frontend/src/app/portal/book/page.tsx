"use client";
// BOOKING SCREEN — student site. Open future slots as perforated tickets.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, BackLink, Btn, Card, Chip, Loader, Logo, Overline } from "@/components/ui";
import { callApi, getSession } from "@/lib/auth";
import { useSnapshot } from "@/lib/useSnapshot";

function todayLocalStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}00:00`;
}

export default function BookingPage() {
  const router = useRouter();
  const { snap, loading, refresh } = useSnapshot();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) router.replace("/login/student");
    // booking is strictly for the logged-in student — staff have their own site
    else if (session.user.role !== "student") {
      router.replace(session.user.staffRole === "admin" ? "/console/team" : "/console");
    }
  }, [router]);

  // After a successful booking, return to the dashboard automatically.
  // The interval only ticks the number; the redirect is a separate effect so we
  // never call router.push() inside a setState updater (React warns about that).
  useEffect(() => {
    if (msg?.kind !== "ok") return;
    setCountdown(6);
    const t = setInterval(() => {
      setCountdown((c) => (c === null ? null : Math.max(0, c - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [msg]);

  useEffect(() => {
    if (msg?.kind === "ok" && countdown === 0) router.push("/portal");
  }, [msg, countdown, router]);

  // The logged-in student books for themselves — no demo impersonation.
  const student = useMemo(() => {
    const session = getSession();
    return session?.user.role === "student" ? snap?.students.find((s) => s.id === session.user.id) ?? null : null;
  }, [snap]);

  const openSlots = useMemo(
    () => (snap?.slots ?? []).filter(
      (s) => s.status === "open" && s.bookedCount < s.capacity && s.date + s.startTime >= todayLocalStr()
        // in reschedule mode, the current slot is pointless to pick
        && !(student?.activeInterview && s.id === student.activeInterview.slotId)
    ),
    [snap, student]
  );
  // Reschedule mode: student already holds a confirmed booking they can move.
  const rescheduling = Boolean(student?.activeInterview && student.effectiveState === "BOOKED");
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of openSlots) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return [...map.entries()].sort();
  }, [openSlots]);

  async function book(slotId: string) {
    if (!student) return;
    setBusySlot(slotId);
    setMsg(null);
    const resched = student.effectiveState === "BOOKED" && student.activeInterview;
    const res = resched
      ? await callApi("/api/interviews", { action: "reschedule", interviewId: student.activeInterview.id, newSlotId: slotId, actor: student.name })
      : await callApi("/api/book", { studentId: student.id, slotId });
    setBusySlot(null);
    if (res.ok) {
      const name = resched ? student.activeInterview.interviewerName : res.data.interviewerName;
      setMsg({
        kind: "ok",
        text: resched
          ? `🔁 Interview moved! Now booked with ${name} — the old slot was released. Your new interviewer will confirm and send the video room link.`
          : `✅ Booked with ${res.data.interviewerName}! Your ${student.badgeName} interview is requested — the join link appears once the interviewer confirms.`,
      });
      refresh();
    } else {
      setMsg({ kind: "err", text: res.error });
    }
  }

  if (loading || !snap) {
    return (
      <main className="theme-paper grid-paper min-h-screen"><Loader label="Loading slots" /></main>
    );
  }

  return (
    <main className="theme-paper grid-paper min-h-screen page-enter">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="sticky-head -mx-6 px-6 py-4 mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="display text-sm" style={{ color: "#6d8a1a" }}>GRIT STUDENT SITE</div>
              <div className="font-mono text-[10px]" style={{ letterSpacing: "0.16em", opacity: 0.55 }}>BOOK AN INTERVIEW</div>
            </div>
          </div>
          <BackLink href="/portal" label="My dashboard" />
        </header>

        {!student && !loading && (
          <div className="mb-5"><Alert kind="err">Log in as a student to book an interview.</Alert></div>
        )}
        {student && student.effectiveState !== "ELIGIBLE" && !rescheduling && (
          <div className="mb-5"><Alert kind="err">{student.stateNote}</Alert></div>
        )}
        {msg && msg.kind === "ok" ? (
          <Card className="pop p-8 text-center mb-6" hover>
            <div className="display text-3xl" style={{ color: "#6d8a1a" }}>{rescheduling ? "🔁 Interview moved" : "✅ Interview requested"}</div>
            <p className="mt-3 text-sm">{msg.text}</p>
            <p className="mt-1 font-mono text-[10px]" style={{ opacity: 0.5, letterSpacing: "0.14em" }}>
              RETURNING TO YOUR DASHBOARD IN {countdown ?? 6}s
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/portal"><Btn>Go to my dashboard now <span className="arrow">→</span></Btn></Link>
              {rescheduling && (
                <Btn variant="ghost" onClick={() => { setMsg(null); setCountdown(null); }}>
                  Reschedule this interview <span className="arrow">↺</span>
                </Btn>
              )}
            </div>
          </Card>
        ) : msg ? (
          <div className="mb-5 toast"><Alert kind={msg.kind}>{msg.text}</Alert></div>
        ) : null}

        {/* Reschedule mode — show what's being moved, then the grid */}
        {rescheduling && (
          <Card className="mb-6 p-5 rise-stagger" style={{ borderLeft: "4px solid #ffb224" }}>
            <Overline>Rescheduling · your current booking</Overline>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span><strong>{student.activeInterview.date}</strong> · {student.activeInterview.startTime}–{student.activeInterview.endTime}</span>
              <span style={{ opacity: 0.6 }}>with {student.activeInterview.interviewerName}</span>
              {student.activeInterview.meetingLink
                ? <Chip color="#5eead4">video room ready</Chip>
                : <Chip color="#ffb224">awaiting interviewer confirmation</Chip>}
            </div>
            <p className="mt-2 text-xs" style={{ opacity: 0.6 }}>
              Pick a new slot below — the old one is released back to other students. Rescheduling is free; repeated no-shows are not.
            </p>
          </Card>
        )}

        {student && (student.effectiveState === "ELIGIBLE" || rescheduling) && (
          <>
            <div className="mb-6">
              <h1 className="display text-3xl">{rescheduling ? "Pick a new slot" : "Pick your slot"}</h1>
              <p className="mt-1 text-sm" style={{ opacity: 0.6 }}>
                30-minute live interview for the <strong>{student.badgeName}</strong>. {openSlots.length} open across {grouped.length} day(s).
              </p>
            </div>
            {grouped.length === 0 && (
              <Card className="grid place-items-center p-14 text-sm" style={{ opacity: 0.6 }}>
                No open slots right now. Interviewers publish availability regularly — check back soon.
              </Card>
            )}
            <div className="space-y-6">
              {grouped.map(([date, slots]) => (
                <div key={date}>
                  <Overline>{prettyDate(date)}</Overline>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {slots.map((s, idx) => {
                      const full = s.bookedCount >= s.capacity;
                      return (
                        <div key={s.id} className="rise-stagger" style={{ "--i": idx } as React.CSSProperties}>
                          <Card className="ticket p-5" hover>
                            <div className="display text-xl">{s.startTime}<span style={{ opacity: 0.35 }}>–{s.endTime}</span></div>
                            <div className="mt-1 text-sm" style={{ opacity: 0.7 }}>{s.interviewerName}</div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <Chip color={s.capacity - s.bookedCount <= 1 ? "#ffb224" : "#6d8a1a"}>{s.capacity - s.bookedCount} left</Chip>
                              <Btn onClick={() => book(s.id)} disabled={busySlot === s.id || full}>
                                {full ? "Full" : busySlot === s.id ? "…" : rescheduling ? "Move here" : "Book"}
                              </Btn>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
}
