// ─────────────────────────────────────────────────────────────────────────────
// Store — JSON persistence. The canonical fixture is the GOLDEN DATASET
// (../golden/golden-dataset.json at repo root). Reset = reload it. This keeps
// demo data, tests, and eval pipeline on a single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDays, todayStr } from "./state.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const GOLDEN_FILE = path.resolve(__dirname, "..", "..", "golden", "golden-dataset.json");
let cache = null;
function loadGolden() {
    if (fs.existsSync(GOLDEN_FILE)) {
        const raw = JSON.parse(fs.readFileSync(GOLDEN_FILE, "utf-8"));
        const ds = expandDateTokens(raw);
        // Log is runtime state — a golden dataset ships empty and grows in-session.
        ds.log = ds.log ?? [];
        return structuredClone(ds);
    }
    throw new Error(`Golden dataset not found at ${GOLDEN_FILE} — create golden/golden-dataset.json.`);
}
/**
 * Golden fixture uses date tokens so the dataset stays valid on any run day:
 *   {{TODAY}} {{TOMORROW}} {{T+n}} {{T-n}}
 */
function expandDateTokens(value) {
    if (typeof value === "string") {
        const t = todayStr();
        return value.replace(/\{\{(TODAY|TOMORROW|T([+-]\d+))\}\}/g, (_m, kind, offset) => {
            if (kind === "TODAY")
                return t;
            if (kind === "TOMORROW")
                return addDays(t, 1);
            return addDays(t, Number(offset));
        });
    }
    if (Array.isArray(value))
        return value.map(expandDateTokens);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandDateTokens(v)]));
    }
    return value;
}
export function getDb() {
    if (cache)
        return cache;
    if (fs.existsSync(DB_FILE)) {
        cache = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
        return cache;
    }
    cache = loadGolden();
    saveDb(cache);
    return cache;
}
export function saveDb(db) {
    if (!fs.existsSync(DATA_DIR))
        fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}
export function withDb(fn) {
    const db = getDb();
    const result = fn(db);
    saveDb(db);
    return result;
}
export function resetDb() {
    cache = loadGolden();
    saveDb(cache);
    return cache;
}
