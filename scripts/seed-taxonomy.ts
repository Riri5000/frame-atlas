// Parse data/documentary-form-atlas.md into TagGroups and Tags.
// Idempotent: upserts by key, safe to re-run after atlas edits.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";

const ATLAS_PATH = join(__dirname, "..", "data", "documentary-form-atlas.md");

// Short, stable tag keys. The heading text in the atlas is the display name;
// the key is what films, the scanner, and the tagger prompt reference.
const KEY_SLUGS: Record<string, string> = {
  "1.1": "archival-only",
  "1.2": "animation",
  "1.3": "subject-cameras",
  "1.4": "nonhuman-cameras",
  "1.5": "screen-capture",
  "1.6": "protective-synthesis",
  "1.7": "specialized-optics",
  "1.8": "generative-form",
  "2.1": "engineered-gaze",
  "2.2": "testimony-only",
  "2.3": "reenactment-interview",
  "2.4": "verbatim-performance",
  "2.5": "no-interview",
  "2.6": "staged-conversation",
  "2.7": "interview-investigation",
  "2.8": "group-process",
  "3.1": "genre-engines",
  "3.2": "withheld-information",
  "3.3": "rashomon-repetition",
  "3.4": "essay-film",
  "3.5": "reflexive-making-of",
  "3.6": "epistolary-diary",
  "3.7": "symphonic",
  "3.8": "impossible-narrators",
  "4.1": "longitudinal",
  "4.2": "inside-the-group",
  "4.3": "collaborative-staging",
  "4.4": "performative-filmmaker",
  "4.5": "shared-authorship",
  "4.6": "subject-fights-back",
  "4.7": "posthumous-archival",
  "5.1": "curated-short",
  "5.2": "vertical-native",
  "5.3": "docuseries-long-feature",
  "5.4": "durational-slow",
  "5.5": "interactive-web",
  "5.6": "immersive-vr",
  "5.7": "crowdsourced-event",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 4)
    .join("-");
}

export function tagKeyFor(num: string, name: string): string {
  return `${num}-${KEY_SLUGS[num] ?? slugify(name)}`;
}

async function main() {
  const md = readFileSync(ATLAS_PATH, "utf-8");

  // "# Axis 1: Filming technique as the story"
  const axisRe = /^# Axis (\d): (.+)$/gm;
  // "## 1.1 Archival-only (no new footage shot)"
  const tagRe = /^## (\d\.\d) (.+)$/gm;

  const axes: Array<{ num: string; name: string }> = [];
  for (const m of md.matchAll(axisRe)) {
    axes.push({ num: m[1], name: m[2].trim() });
  }
  if (axes.length !== 5) {
    throw new Error(`Expected 5 axes in the atlas, found ${axes.length}. Check the markdown headings.`);
  }

  const subTags: Array<{ num: string; name: string }> = [];
  for (const m of md.matchAll(tagRe)) {
    subTags.push({ num: m[1], name: m[2].trim() });
  }
  if (subTags.length === 0) {
    throw new Error("No sub-category headings (## N.M ...) found in the atlas.");
  }

  const groupIdByAxis: Record<string, number> = {};
  for (const axis of axes) {
    const key = `axis${axis.num}`;
    const group = await prisma.tagGroup.upsert({
      where: { key },
      update: { name: axis.name },
      create: { key, name: axis.name },
    });
    groupIdByAxis[axis.num] = group.id;
    console.log(`group ${key}: ${axis.name}`);
  }

  const specialGroup = await prisma.tagGroup.upsert({
    where: { key: "special" },
    update: { name: "Special" },
    create: { key: "special", name: "Special" },
  });

  for (const tag of subTags) {
    const axisNum = tag.num.split(".")[0];
    const groupId = groupIdByAxis[axisNum];
    if (!groupId) throw new Error(`Sub-category ${tag.num} has no matching axis group.`);
    const key = tagKeyFor(tag.num, tag.name);
    await prisma.tag.upsert({
      where: { key },
      update: { name: tag.name, groupId },
      create: { key, name: tag.name, groupId },
    });
    console.log(`  tag ${key}: ${tag.name}`);
  }

  for (const special of [
    { key: "unclassified", name: "Unclassified watchlist" },
    { key: "outlier", name: "Outlier" },
  ]) {
    await prisma.tag.upsert({
      where: { key: special.key },
      update: { name: special.name, groupId: specialGroup.id },
      create: { key: special.key, name: special.name, groupId: specialGroup.id },
    });
    console.log(`  tag ${special.key}: ${special.name}`);
  }

  const groupCount = await prisma.tagGroup.count();
  const tagCount = await prisma.tag.count();
  console.log(`\nDone. ${groupCount} tag groups, ${tagCount} tags.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
