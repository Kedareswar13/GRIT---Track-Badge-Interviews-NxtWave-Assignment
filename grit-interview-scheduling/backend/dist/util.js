// Shared route utilities.
export function uid(prefix) {
    const n = Math.floor(Math.random() * 1296).toString(36);
    return `${prefix}_${Date.now().toString(36)}${n}`;
}
export function audit(db, actor, action, detail) {
    db.log.push({ id: uid("lg"), at: new Date().toISOString(), actor, action, detail });
    if (db.log.length > 200)
        db.log.splice(0, db.log.length - 200);
}
