// One-time fixture tool: writes scrypt password records for every student and
// staff member in the golden dataset, all sharing DEMO_PASSWORD.
// Re-run any time you add users to golden-dataset.json without passwords:
//   node scripts/hash-passwords.mjs
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const DEMO_PASSWORD = "grit2026"; // documented in README + TESTING_GUIDE

const path = new URL("../golden/golden-dataset.json", import.meta.url);
const db = JSON.parse(readFileSync(path, "utf-8"));

function record(plain) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(plain, salt, 32).toString("hex") };
}

let count = 0;
for (const s of [...db.students, ...db.staff]) {
  s.password = record(DEMO_PASSWORD);
  count++;
}

writeFileSync(path, JSON.stringify(db, null, 2) + "\n");
console.log(`hashed DEMO_PASSWORD for ${count} users in golden-dataset.json`);
