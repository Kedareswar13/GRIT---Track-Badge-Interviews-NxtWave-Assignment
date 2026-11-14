"use client";
// One read endpoint powers every screen; manual refresh keeps mutations simple.
import { useCallback, useEffect, useState } from "react";
import { getSession } from "./auth";

export interface Snapshot {
  tracks: { id: string; name: string; badgeName: string; requiredSkills: string[] }[];
  staff: { id: string; name: string; email: string; role: string }[];
  students: any[];
  slots: any[];
  interviews: any[];
  outcomes: any[];
  flags: any[];
  transcripts: { interviewId: string; title: string; notes: string }[];
  log: any[];
  counters: Record<string, number>;
}

export function useSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const session = getSession();
    const res = await fetch("/api/snapshot", {
      headers: session ? { "x-grit-session": session.token } : {},
      cache: "no-store",
    });
    const json = await res.json();
    if (json.ok) setSnap(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { snap, loading, refresh };
}
