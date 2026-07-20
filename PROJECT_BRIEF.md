# FRAME ATLAS: Project Brief for Claude Code

*A visual reference platform for documentary form, in the spirit of eycndy.com, backed by the Documentary Form Atlas taxonomy, with an automated scanner that finds and tags new documentaries.*

Working title: **Frame Atlas** (rename freely).

---

## Opening prompt (paste this into Claude Code)

> Read PROJECT_BRIEF.md in full before writing any code. Build Phase 1 only: initialize the project, create the Prisma schema exactly as specified, build the seed pipeline that matches the atlas films to TMDB, and confirm the database is populated before touching any UI. Ask me for my TMDB API key when you need it. Use my existing Slatebase project as the reference for stack conventions (Next.js App Router, Prisma, SQLite, local-first, no auth).

---

## What this is

1. A browsable visual library of documentaries, each tagged by formal approach using the five-axis taxonomy from my Documentary Form Atlas (Notion page: "Documentary Form Atlas", also available as documentary-form-atlas.md).
2. Each film card links out to IMDb, Letterboxd, a trailer, and where-to-watch info.
3. A scanner pipeline that periodically finds new documentaries (TMDB discover, festival lineups, trade press), auto-tags them with the taxonomy via the Claude API, and places them in a review queue for my approval.

## What this is not

- Not a public product. Local-first, single user, no auth.
- Not a review site. No ratings, no comments. Letterboxd handles that.
- The scanner never auto-publishes. Everything lands in the review queue first.

---

## Stack

- Next.js (App Router) + TypeScript
- Prisma + SQLite (file: ./data/atlas.db)
- Tailwind for styling
- TMDB API v3 as the sole metadata source (env: TMDB_API_KEY)
- Anthropic API for scanner tagging (env: ANTHROPIC_API_KEY), model claude-sonnet-4-6
- node-cron for scheduled scans, plus a manual "Scan now" button

## Key data tricks

- TMDB /movie/{id}/external_ids returns imdb_id. IMDb URL: https://www.imdb.com/title/{imdb_id}
- Letterboxd resolves https://letterboxd.com/tmdb/{tmdb_id} directly. No Letterboxd API needed.
- TMDB /movie/{id}/watch/providers returns JustWatch-powered streaming availability. Store the ZA region block; display "where to watch (South Africa)" on each card.
- TMDB /movie/{id}/videos returns YouTube trailer keys for embeds.
- TMDB /movie/{id}/images returns backdrops and stills for the masonry grid, not just posters.
- Some atlas entries are series (The Jinx, The Up series, Wormwood) or non-films (The Fogo Process, 60 Second Docs as an institution). Schema must support kind: FILM | SERIES | BODY_OF_WORK | INSTITUTION. Series use TMDB /tv endpoints; institutions get manual entries with no TMDB id.

---

## Prisma schema (build exactly this, extend only if needed)

```prisma
model Film {
  id            Int       @id @default(autoincrement())
  tmdbId        Int?      @unique
  imdbId        String?
  kind          String    @default("FILM") // FILM | SERIES | BODY_OF_WORK | INSTITUTION
  title         String
  year          Int?
  director      String?
  runtimeMin    Int?
  overview      String?   // TMDB synopsis
  formalNote    String?   // MY note: what is formally interesting (from atlas or scanner)
  posterPath    String?
  backdropPaths String?   // JSON array of TMDB image paths
  trailerKey    String?   // YouTube key
  watchZA       String?   // JSON of ZA watch providers
  watchFirst    Boolean   @default(false) // the star markers from the atlas
  seen          Boolean   @default(false)
  viewingNotes  String?
  source        String    @default("atlas") // atlas | scanner | manual
  createdAt     DateTime  @default(now())
  tags          FilmTag[]
}

model TagGroup {
  id    Int    @id @default(autoincrement())
  key   String @unique // axis1 .. axis5, special
  name  String         // "Filming technique as the story", etc.
  tags  Tag[]
}

model Tag {
  id        Int       @id @default(autoincrement())
  key       String    @unique // e.g. "1.3-subject-cameras"
  name      String    // "Cameras given to subjects"
  groupId   Int
  group     TagGroup  @relation(fields: [groupId], references: [id])
  films     FilmTag[]
}

model FilmTag {
  filmId Int
  tagId  Int
  film   Film @relation(fields: [filmId], references: [id])
  tag    Tag  @relation(fields: [tagId], references: [id])
  @@id([filmId, tagId])
}

model ScanCandidate {
  id           Int      @id @default(autoincrement())
  tmdbId       Int?     @unique
  title        String
  year         Int?
  sourceUrl    String?  // where the scanner found it
  sourceName   String?  // "TMDB discover" | "IDFA 2026" | "RealScreen" ...
  suggestedTags String? // JSON array of tag keys from Claude
  formalNote   String?  // Claude's one-line "what's formally interesting"
  confidence   String?  // high | medium | low
  status       String   @default("pending") // pending | approved | rejected
  createdAt    DateTime @default(now())
}
```

Tag vocabulary: derive the full tag list from documentary-form-atlas.md plus the three axis sub-pages in Notion (axes 3, 4, 5). One tag per sub-category (1.1 through 5.7), plus an "unclassified" special tag. Also add an "outlier" special tag for future use.

---

## Directory structure

```
frame-atlas/
├── PROJECT_BRIEF.md
├── data/
│   ├── atlas.db
│   └── documentary-form-atlas.md      # seed source of truth
├── prisma/schema.prisma
├── scripts/
│   ├── seed-taxonomy.ts               # parse atlas md -> TagGroups + Tags
│   ├── seed-films.ts                  # parse atlas films -> TMDB match -> Film rows
│   └── enrich.ts                      # backfill images, trailers, watch providers
├── src/
│   ├── app/
│   │   ├── page.tsx                   # masonry grid + tag filter sidebar
│   │   ├── film/[id]/page.tsx         # detail: stills, note, links, viewing notes
│   │   ├── queue/page.tsx             # scanner review queue (approve/reject/edit tags)
│   │   └── api/
│   │       ├── scan/route.ts          # POST triggers a scan
│   │       └── queue/route.ts         # approve/reject actions
│   ├── components/
│   │   ├── MasonryGrid.tsx
│   │   ├── FilmCard.tsx               # backdrop still, title, tags, outbound links
│   │   ├── TagFilter.tsx              # grouped by axis, multi-select AND/OR toggle
│   │   └── QueueCard.tsx
│   ├── lib/
│   │   ├── tmdb.ts                    # typed TMDB client
│   │   ├── links.ts                   # imdb/letterboxd/trailer URL builders
│   │   └── db.ts
│   └── scanner/
│       ├── sources/
│       │   ├── tmdbDiscover.ts        # new docs: with_genres=99, sorted by date
│       │   ├── festivals.ts           # fetch + parse lineup pages (list below)
│       │   └── press.ts               # RSS: RealScreen, Documentary mag, IndieWire docs
│       ├── tagger.ts                  # Claude API call, taxonomy in system prompt
│       └── run.ts                     # orchestrator -> ScanCandidate rows
└── .env                               # TMDB_API_KEY, ANTHROPIC_API_KEY
```

Festival sources for scanner v1: IDFA, CPH:DOX, Sundance, Hot Docs, True/False, Sheffield DocFest, Encounters (South Africa), Durban International Film Festival.

---

## Tagger prompt design (scanner)

System prompt for the tagging call must contain: the full taxonomy (axis names, tag keys, one-line definitions), instructions to return strict JSON only: { "tags": ["2.3", ...], "formalNote": "...", "confidence": "high|medium|low" }, and the rule: if nothing formally notable, return tags: [] and confidence: low so I can skip conventional films fast. The queue UI sorts by confidence descending.

## Build phases

1. **Foundation**: init, schema, seed-taxonomy, seed-films (interactive: when TMDB match is ambiguous, show candidates and ask), enrich. Exit criteria: db has ~100 tagged films with images.
2. **Library UI**: masonry grid, tag filter, film detail, seen/notes editing. Exit criteria: I can browse by any tag combination and open outbound links.
3. **Scanner**: tmdbDiscover first, then press RSS, then festival parsers. Review queue UI. Exit criteria: one scan run produces sensible pending candidates I can approve into the library.
4. **Polish**: cron schedule, "watch first" filter, unclassified/outlier views, export watchlist.

## Conventions

- Follow Slatebase patterns for anything unspecified.
- Never use em dashes in any UI copy or generated text.
- All scanner writes go to ScanCandidate, never directly to Film.
- Keep every external call behind lib/tmdb.ts so rate limiting lives in one place (TMDB allows ~50 req/s, be nowhere near it).

---

## MCP servers to add to Claude Code for this project

These assist the DEV LOOP. The app itself uses plain API calls.

1. **TMDB MCP** (@cinetribe/mcp-server-tmdb via npx, needs TMDB_API_KEY). Lets Claude Code explore TMDB data live while building the matcher: verify IDs, inspect what discover returns for genre 99, check image availability for obscure titles.
   `claude mcp add tmdb -e TMDB_API_KEY=... -- npx -y @cinetribe/mcp-server-tmdb@latest`
2. **Firecrawl MCP** (official, firecrawl-mcp-server; free tier 500 credits, keyless tier exists). For developing the festival parsers: scrape a lineup page once, look at the clean markdown, then write the parser against reality instead of guesswork. Could later replace hand-written parsers entirely if the free tier suffices.
3. **Playwright MCP** (official Microsoft). For testing the grid and queue UI: snapshot-based navigation, click-through of approve/reject flows.
4. **Notion MCP** (already connected to my Claude account; add to Claude Code too). To pull the Documentary Form Atlas pages directly as the seed source instead of the markdown file, and optionally to sync approved films back to a Notion database later.

Skip: Letterboxd MCPs (no official API, all fragile), IMDb scrapers (against ToS, and TMDB covers it).
