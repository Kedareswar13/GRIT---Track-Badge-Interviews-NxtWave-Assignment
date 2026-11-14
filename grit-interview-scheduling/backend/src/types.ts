// ─────────────────────────────────────────────────────────────────────────────
// Domain types — single source of truth. Shared shape with golden dataset.
// ─────────────────────────────────────────────────────────────────────────────

export type InterviewState =
  | "NOT_ELIGIBLE"
  | "ELIGIBLE"
  | "BOOKED"
  | "NO_SHOW"
  | "RETAKE_DUE"
  | "PASSED"
  | "BADGE_NULLIFIED";

export type BadgeStatus = "none" | "active" | "nullified";
export type StaffRole = "interviewer" | "admin";

export interface Track {
  id: string;
  name: string;
  badgeName: string;
  requiredSkills: string[];
}

/**
 * Passwords are never stored in plaintext — scrypt hash + per-user salt.
 * Golden users all share the demo password `grit2026`; the admin console can
 * create users with any password (hashed the same way). The snapshot endpoint
 * strips these fields before they ever reach the browser.
 */
export interface PasswordRecord {
  salt: string;
  hash: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  trackId: string;
  skillsCleared: string[];
  interviewState: InterviewState;
  noShowCount: number;
  attempts: number;
  retakeAvailableFrom: string | null;
  badgeStatus: BadgeStatus;
  badgeAwardedAt: string | null;
  nullifiedReason: string | null;
  password: PasswordRecord;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  password: PasswordRecord;
}

export interface Slot {
  id: string;
  interviewerId: string;
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
  capacity: number;
  bookedCount: number;
  status: "open" | "cancelled";
}

export type InterviewStatus = "booked" | "completed" | "cancelled" | "no_show";

export interface Interview {
  id: string;
  studentId: string;
  slotId: string;
  trackId: string;
  status: InterviewStatus;
  bookedAt: string;
  /**
   * Video meeting link. Null until the interviewer ACCEPTS the booking request
   * — then a free video room (Jitsi Meet, no API key needed) is auto-generated.
   * Production swap: Google Calendar API to mint real meet.google.com links.
   */
  meetingLink: string | null;
}

export type OutcomeResult = "pass" | "fail" | "retake";

export interface Outcome {
  id: string;
  interviewId: string;
  result: OutcomeResult;
  feedback: string;
  aiAssisted: boolean;
  recordedBy: string;
  recordedAt: string;
}

export interface MalpracticeFlag {
  id: string;
  studentId: string;
  reason: string;
  flaggedBy: string;
  flaggedAt: string;
}

/**
 * Sample interview transcripts (mock GRIT badge interviews). They give the
 * interviewer console realistic raw notes to run the local AI assist on, and
 * demo what recorded evidence would look like in production.
 */
export interface Transcript {
  interviewId: string;
  title: string;
  /** Raw interviewer notes exactly as they'd be typed during the call */
  notes: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface Dataset {
  tracks: Track[];
  students: Student[];
  staff: Staff[];
  slots: Slot[];
  interviews: Interview[];
  outcomes: Outcome[];
  malpracticeFlags: MalpracticeFlag[];
  transcripts: Transcript[];
  log: AuditEntry[];
}

export interface AiFeedback {
  summary: string;
  recommendation: "pass" | "fail" | "retake" | "unknown";
  strengths: string[];
  concerns: string[];
  suggestedFeedback?: string;
}

/** Mock session issued by /api/auth/login and carried as x-grit-session header. */
export interface Session {
  role: "student" | "staff";
  userId: string;
  name: string;
  staffRole?: StaffRole;
}
