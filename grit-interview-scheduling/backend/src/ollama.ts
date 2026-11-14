// ─────────────────────────────────────────────────────────────────────────────
// Ollama client — 100% local inference. Primary: qwen2.5:3b, fallback: 7b.
// ─────────────────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const PRIMARY = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
const FALLBACK = process.env.OLLAMA_MODEL_FALLBACK ?? "qwen2.5:7b";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 90_000);

export class AiUnavailableError extends Error {}

async function generateOnce(model: string, system: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, system, prompt, stream: false, options: { temperature: 0.3 } }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = (await res.json()) as { response?: string };
    if (!data.response) throw new Error("Empty Ollama response");
    return data.response.trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaGenerate(system: string, prompt: string): Promise<string> {
  try {
    return await generateOnce(PRIMARY, system, prompt);
  } catch (err) {
    console.warn(`[ollama] primary "${PRIMARY}" failed (${err}); trying fallback "${FALLBACK}"`);
    try {
      return await generateOnce(FALLBACK, system, prompt);
    } catch (err2) {
      throw new AiUnavailableError(
        `Local AI unavailable. Is Ollama running? (ollama serve) with models "${PRIMARY}" / "${FALLBACK}" pulled.`
      );
    }
  }
}

export function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```json/gi, "```").split("```").filter(Boolean);
  for (const c of [text, ...cleaned]) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(c.slice(start, end + 1)) as T;
      } catch {
        // keep scanning
      }
    }
  }
  throw new Error("Model did not return valid JSON.");
}
