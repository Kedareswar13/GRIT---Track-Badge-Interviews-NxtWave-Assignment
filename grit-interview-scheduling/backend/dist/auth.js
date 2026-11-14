import { getDb } from "./db.js";
export function issueSession(user) {
    const session = "role" in user && user.role
        ? { role: "staff", userId: user.id, name: user.name, staffRole: user.role }
        : { role: "student", userId: user.id, name: user.name };
    return Buffer.from(JSON.stringify(session)).toString("base64");
}
export function readSession(req) {
    const raw = req.header("x-grit-session");
    if (!raw)
        return null;
    try {
        return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    }
    catch {
        return null;
    }
}
function deny(res, who) {
    res.status(403).json({ ok: false, error: `${who} role required for this action.` });
}
/** Role gates — production would be middleware + RBAC; keep explicit for clarity. */
export function requireStudent(req, res, next) {
    const s = readSession(req);
    if (!s || s.role !== "student")
        return deny(res, "Student");
    next();
}
export function requireStaff(req, res, next) {
    const s = readSession(req);
    if (!s || s.role !== "staff")
        return deny(res, "Staff");
    next();
}
export function requireAdmin(req, res, next) {
    const s = readSession(req);
    if (!s || s.role !== "staff" || s.staffRole !== "admin")
        return deny(res, "Admin");
    next();
}
/** POST /api/auth/login { email } → session token + profile. */
export function login(email) {
    const db = getDb();
    const student = db.students.find((s) => s.email.toLowerCase() === email.toLowerCase());
    if (student)
        return { token: issueSession(student), user: { id: student.id, name: student.name, role: "student" } };
    const staff = db.staff.find((s) => s.email.toLowerCase() === email.toLowerCase());
    if (staff)
        return { token: issueSession(staff), user: { id: staff.id, name: staff.name, role: "staff", staffRole: staff.role } };
    return null;
}
