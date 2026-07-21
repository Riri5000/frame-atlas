"use client";

import Link from "next/link";
import { imdbUrl, letterboxdUrl, trailerUrl } from "@/lib/links";
import { tmdbImage, type LibraryFilm } from "@/lib/types";

const KIND_LABELS: Record<string, string> = {
  SERIES: "Series",
  BODY_OF_WORK: "Body of work",
  INSTITUTION: "Institution",
};

function OutboundLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-xs text-neutral-400 transition-colors hover:text-white"
    >
      {label}
    </a>
  );
}

export default function FilmCard({ film }: { film: LibraryFilm }) {
  const image = film.backdrop
    ? tmdbImage(film.backdrop, "w780")
    : film.posterPath
      ? tmdbImage(film.posterPath, "w780")
      : null;
  const kindLabel = KIND_LABELS[film.kind];

  return (
    <div className="group mb-4 break-inside-avoid overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <Link href={`/film/${film.id}`} className="block">
        {image ? (
          <img
            src={image}
            alt={film.title}
            loading="lazy"
            className="w-full object-cover transition-opacity group-hover:opacity-90"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 px-4">
            <span className="text-center font-serif text-xl text-neutral-300">{film.title}</span>
          </div>
        )}
      </Link>
      <div className="p-3">
        <Link href={`/film/${film.id}`} className="block">
          <div className="flex items-baseline gap-2">
            <h3 className="font-medium leading-snug text-neutral-100 group-hover:text-white">
              {film.watchFirst && <span title="Watch first" className="mr-1 text-amber-400">*</span>}
              {film.title}
            </h3>
            {film.year && <span className="text-xs text-neutral-500">{film.year}</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
            {film.director && <span>{film.director}</span>}
            {kindLabel && (
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                {kindLabel}
              </span>
            )}
            {film.seen && <span className="text-emerald-500">Seen</span>}
          </div>
        </Link>
        <div className="mt-2 flex flex-wrap gap-1">
          {film.tagKeys.map((key) => (
            <span
              key={key}
              className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400"
            >
              {key.split("-")[0]}
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-3 border-t border-neutral-800 pt-2">
          <OutboundLink href={imdbUrl(film.imdbId)} label="IMDb" />
          <OutboundLink href={letterboxdUrl(film.tmdbId, film.kind)} label="Letterboxd" />
          <OutboundLink href={trailerUrl(film.trailerKey)} label="Trailer" />
        </div>
      </div>
    </div>
  );
}
