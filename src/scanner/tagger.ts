// Claude tagging call. The full taxonomy goes in the system prompt; the
// model returns strict JSON: { tags, formalNote, confidence }. Films with
// nothing formally notable come back as tags: [] and confidence: low so
// conventional documentaries can be skipped fast in the queue.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import type { SourceCandidate } from "./types";

const MODEL = process.env.SCANNER_MODEL ?? "claude-sonnet-4-6";

export type TagResult = {
  tags: string[]; // normalized full tag keys, e.g. "2.3-reenactment-interview"
  formalNote: string | null;
  confidence: "high" | "medium" | "low";
};

let cachedSystemPrompt: string | null = null;
let cachedKeyMap: Map<string, string> | null = null; // "2.3" -> "2.3-reenactment-interview"

async function taxonomy(): Promise<{ systemPrompt: string; keyMap: Map<string, string> }> {
  if (cachedSystemPrompt && cachedKeyMap) {
    return { systemPrompt: cachedSystemPrompt, keyMap: cachedKeyMap };
  }
  const groups = await prisma.tagGroup.findMany({
    include: { tags: { orderBy: { key: "asc" } } },
    orderBy: { id: "asc" },
  });

  const keyMap = new Map<string, string>();
  const lines: string[] = [];
  for (const group of groups) {
    if (group.key === "special") continue;
    lines.push(`${group.name}:`);
    for (const tag of group.tags) {
      const shortKey = tag.key.split("-")[0]; // "2.3"
      keyMap.set(shortKey, tag.key);
      keyMap.set(tag.key, tag.key);
      lines.push(`  ${shortKey}: ${tag.name}`);
    }
  }

  const systemPrompt = [
    "You classify documentaries by formal approach using a five-axis taxonomy.",
    "The axes and their sub-categories:",
    "",
    ...lines,
    "",
    "Given a documentary's title, year, and synopsis, decide which sub-categories",
    "(if any) describe a formally notable approach in this film. Judge only from",
    "the provided text; do not invent techniques the synopsis does not support.",
    "",
    "Respond with strict JSON only, no prose, no code fences:",
    '{ "tags": ["2.3"], "formalNote": "...", "confidence": "high|medium|low" }',
    "",
    "Rules:",
    "- tags: array of sub-category numbers like \"1.4\" or \"3.2\". Empty array if nothing formally notable.",
    "- formalNote: one sentence on what is formally interesting, written plainly. Null if tags is empty.",
    "- confidence: how sure you are. If the synopsis suggests a conventional talking-heads documentary, return tags: [] and confidence: \"low\".",
    "- Never use em dashes in any text you write.",
  ].join("\n");

  cachedSystemPrompt = systemPrompt;
  cachedKeyMap = keyMap;
  return { systemPrompt, keyMap };
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function taggerAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Deep pass for candidates whose synopsis alone showed nothing formally
// notable. Claude searches the web for reviews and festival coverage of the
// film, then applies the same taxonomy with the same strict JSON contract.
export async function researchCandidate(candidate: SourceCandidate): Promise<TagResult | null> {
  if (!taggerAvailable()) return null;

  const { systemPrompt, keyMap } = await taxonomy();
  const client = new Anthropic();

  const researchInstructions =
    "\n\nFor this film the synopsis alone was inconclusive. Search the web for" +
    " reviews, festival program notes, or interviews about this specific film" +
    " (verify title AND year match before trusting a source). Base your tags on" +
    " what critics describe about its form: how it is shot, structured, and" +
    " what the filmmaker-subject relationship is. If coverage is thin or the" +
    " film is formally conventional, return tags: [] and confidence: \"low\".";

  const userContent = [
    `Title: ${candidate.title}`,
    `Year: ${candidate.year ?? "unknown"}`,
    `Source: ${candidate.sourceName}`,
    `Synopsis: ${candidate.overview ?? "(none available)"}`,
  ].join("\n");

  try {
    let messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];
    let response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt + researchInstructions,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages,
    });

    // Server-side tool loops can pause; resend to let the server resume.
    for (let i = 0; i < 4 && response.stop_reason === "pause_turn"; i++) {
      messages = [...messages, { role: "assistant", content: response.content }];
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt + researchInstructions,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
        messages,
      });
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson(text) as {
      tags?: unknown;
      formalNote?: unknown;
      confidence?: unknown;
    } | null;
    if (!parsed) return null;

    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .map((t) => (typeof t === "string" ? keyMap.get(t.trim()) : undefined))
          .filter((t): t is string => Boolean(t))
      : [];
    const confidence =
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low";
    const formalNote =
      typeof parsed.formalNote === "string" && parsed.formalNote.trim().length > 0
        ? parsed.formalNote.trim()
        : null;

    return { tags, formalNote, confidence };
  } catch (err) {
    console.warn(
      `research: failed for ${candidate.title}: ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}

export async function tagCandidate(candidate: SourceCandidate): Promise<TagResult | null> {
  if (!taggerAvailable()) return null;

  const { systemPrompt, keyMap } = await taxonomy();
  const client = new Anthropic();

  const userContent = [
    `Title: ${candidate.title}`,
    `Year: ${candidate.year ?? "unknown"}`,
    `Source: ${candidate.sourceName}`,
    `Synopsis: ${candidate.overview ?? "(none available)"}`,
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson(text) as {
      tags?: unknown;
      formalNote?: unknown;
      confidence?: unknown;
    } | null;
    if (!parsed) return null;

    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .map((t) => (typeof t === "string" ? keyMap.get(t.trim()) : undefined))
          .filter((t): t is string => Boolean(t))
      : [];
    const confidence =
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? parsed.confidence
        : "low";
    const formalNote =
      typeof parsed.formalNote === "string" && parsed.formalNote.trim().length > 0
        ? parsed.formalNote.trim()
        : null;

    return { tags, formalNote, confidence };
  } catch (err) {
    console.warn(
      `tagger: failed for ${candidate.title}: ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}
