import Link from "next/link";
import { notFound } from "next/navigation";
import ViewingNotes from "@/components/ViewingNotes";
import { prisma } from "@/lib/db";
import { imdbUrl, letterboxdUrl, tmdbUrl, trailerUrl } from "@/lib/links";
import { tmdbImage } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  FILM: "Film",
  SERIES: "Series",
  BODY_OF_WORK: "Body of work",
  INSTITUTION: "Institution",
};

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type ProviderBlock = {
  link?: string;
  flatrate?: Array<{ provider_name: string }>;
  free?: Array<{ provider_name: string }>;
  ads?: Array<{ provider_name: string }>;
  rent?: Array<{ provider_name: string }>;
  buy?: Array<{ provider_name: string }>;
};

function parseProviders(watchZA: string | null): Array<{ label: string; names: string[] }> {
  if (!watchZA) return [];
  let block: ProviderBlock;
  try {
    block = JSON.parse(watchZA);
  } catch {
    return [];
  }
  const sections: Array<[string, Array<{ provider_name: string }> | undefined]> = [
    ["Stream", [...(block.flatrate ?? []), ...(block.free ?? []), ...(block.ads ?? [])]],
    ["Rent", block.rent],
    ["Buy", block.buy],
  ];
  return sections
    .filter(([, list]) => list && list.length > 0)
    .map(([label, list]) => ({
      label,
      names: Array.from(new Set(list!.map((p) => p.provider_name))),
    }));
}

function ExternalLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
    >
      {label}
    </a>
  );
}

export default async function FilmPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const film = await prisma.film.findUnique({
    where: { id },
    include: { tags: { include: { tag: { include: { group: true } } } } },
  });
  if (!film) notFound();

  const backdrops = parseJsonArray(film.backdropPaths);
  const providers = parseProviders(film.watchZA);
  const tagsByGroup = new Map<string, { groupName: string; tags: Array<{ key: string; name: string }> }>();
  for (const ft of film.tags) {
    const g = ft.tag.group;
    if (!tagsByGroup.has(g.key)) tagsByGroup.set(g.key, { groupName: g.name, tags: [] });
    tagsByGroup.get(g.key)!.tags.push({ key: ft.tag.key, name: ft.tag.name });
  }

  const meta = [
    KIND_LABELS[film.kind] ?? film.kind,
    film.year?.toString(),
    film.director ?? undefined,
    film.runtimeMin ? `${film.runtimeMin} min` : undefined,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-sm text-neutral-500 hover:text-white">
        &larr; Back to library
      </Link>

      <header className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">
          {film.watchFirst && <span title="Watch first" className="mr-2 text-amber-400">*</span>}
          {film.title}
        </h1>
        <p className="mt-1 text-neutral-400">{meta.join(" · ")}</p>
      </header>

      {backdrops.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-3">
          {backdrops.slice(0, 9).map((path, i) => (
            <img
              key={path}
              src={tmdbImage(path, "w780")}
              alt={`${film.title} still ${i + 1}`}
              loading={i < 3 ? "eager" : "lazy"}
              className="w-full rounded object-cover"
            />
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-[2fr,1fr]">
        <div>
          {film.formalNote && (
            <section className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-500">
                Why it is in the atlas
              </h2>
              <p className="mt-2 leading-relaxed text-neutral-200">{film.formalNote}</p>
            </section>
          )}
          {film.overview && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Synopsis
              </h2>
              <p className="mt-2 leading-relaxed text-neutral-300">{film.overview}</p>
            </section>
          )}
          {film.trailerKey && (
            <section className="mt-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Trailer
              </h2>
              <iframe
                src={`https://www.youtube.com/embed/${film.trailerKey}`}
                title={`${film.title} trailer`}
                allowFullScreen
                className="aspect-video w-full rounded-lg border border-neutral-800"
              />
            </section>
          )}
          <ViewingNotes filmId={film.id} seen={film.seen} viewingNotes={film.viewingNotes ?? ""} />
        </div>

        <aside>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Form tags</h2>
            {Array.from(tagsByGroup.values()).map((group) => (
              <div key={group.groupName} className="mt-3">
                <p className="text-[11px] uppercase tracking-wide text-neutral-600">{group.groupName}</p>
                <ul className="mt-1 space-y-1">
                  {group.tags.map((tag) => (
                    <li key={tag.key} className="text-sm text-neutral-200">
                      <span className="mr-1.5 font-mono text-[10px] text-neutral-500">
                        {tag.key.split("-")[0]}
                      </span>
                      {tag.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Where to watch (South Africa)
            </h2>
            {providers.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {providers.map((section) => (
                  <li key={section.label} className="text-sm">
                    <span className="text-neutral-500">{section.label}:</span>{" "}
                    <span className="text-neutral-200">{section.names.join(", ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-neutral-600">No ZA streaming availability on record.</p>
            )}
          </section>

          <section className="mt-6 flex flex-wrap gap-2">
            <ExternalLink href={imdbUrl(film.imdbId)} label="IMDb" />
            <ExternalLink href={letterboxdUrl(film.tmdbId, film.kind)} label="Letterboxd" />
            <ExternalLink href={tmdbUrl(film.tmdbId, film.kind)} label="TMDB" />
            <ExternalLink href={trailerUrl(film.trailerKey)} label="YouTube" />
          </section>
        </aside>
      </div>
    </main>
  );
}
