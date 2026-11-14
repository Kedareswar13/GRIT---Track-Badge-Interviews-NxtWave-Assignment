export function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function nowHHMM() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function addDays(isoDate, days) {
    const d = new Date(`${isoDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function isSlotInFuture(slot) {
    if (slot.date > todayStr())
        return true;
    if (slot.date < todayStr())
        return false;
    return slot.startTime > nowHHMM();
}
export function trackOf(db, student) {
    return db.tracks.find((t) => t.id === student.trackId);
}
export function allSkillsCleared(student, track) {
    return track.requiredSkills.every((s) => student.skillsCleared.includes(s));
}
/** Resolves time-based transitions (cooldown expiry, eligibility, locks) on read. */
export function effectiveState(db, student) {
    if (student.badgeStatus === "nullified") {
        return { state: "BADGE_NULLIFIED", note: "Badge nullified due to malpractice flag." };
    }
    if (student.interviewState === "PASSED") {
        return { state: "PASSED", note: "Interview cleared — badge earned." };
    }
    const track = trackOf(db, student);
    const cleared = allSkillsCleared(student, track);
    if (student.interviewState === "NOT_ELIGIBLE") {
        if (cleared)
            return { state: "ELIGIBLE", note: "All track skills cleared — you can book your badge interview." };
        return { state: "NOT_ELIGIBLE", note: "Clear every skill contest for this track first." };
    }
    if (student.interviewState === "RETAKE_DUE") {
        if (student.retakeAvailableFrom && student.retakeAvailableFrom <= todayStr()) {
            return { state: "ELIGIBLE", note: "Retake window is open — rebook when ready." };
        }
        return { state: "RETAKE_DUE", note: `You can rebook from ${student.retakeAvailableFrom}.` };
    }
    if (student.interviewState === "NO_SHOW") {
        if (student.noShowCount >= 2 && student.retakeAvailableFrom && student.retakeAvailableFrom > todayStr()) {
            return { state: "NO_SHOW", note: `Booking locked until ${student.retakeAvailableFrom} (repeated no-shows).` };
        }
        return { state: "ELIGIBLE", note: "You missed your interview — please rebook a new slot." };
    }
    if (student.interviewState === "BOOKED") {
        const interview = db.interviews.find((i) => i.studentId === student.id && i.status === "booked");
        if (!interview)
            return { state: "ELIGIBLE", note: "Your interview was cancelled — please rebook." };
        const slot = db.slots.find((s) => s.id === interview.slotId);
        const staff = db.staff.find((i) => i.id === slot.interviewerId);
        return { state: "BOOKED", note: `Interview on ${slot.date} at ${slot.startTime} with ${staff.name}.` };
    }
    return { state: student.interviewState, note: "" };
}
export function bookingCheck(db, student, slot) {
    const eff = effectiveState(db, student);
    if (eff.state !== "ELIGIBLE") {
        return { ok: false, reason: `Student is ${eff.state.replace("_", " ").toLowerCase()} — not bookable right now. ${eff.note}` };
    }
    if (slot.status !== "open")
        return { ok: false, reason: "This slot is no longer available." };
    if (!isSlotInFuture(slot))
        return { ok: false, reason: "Cannot book a slot in the past." };
    if (slot.bookedCount >= slot.capacity)
        return { ok: false, reason: "This slot is full." };
    for (const iv of db.interviews.filter((i) => i.studentId === student.id && i.status === "booked")) {
        const other = db.slots.find((s) => s.id === iv.slotId);
        if (other && other.date === slot.date && other.startTime < slot.endTime && slot.startTime < other.endTime) {
            return { ok: false, reason: `You already have an interview on ${other.date} ${other.startTime}–${other.endTime}.` };
        }
    }
    return { ok: true };
}
