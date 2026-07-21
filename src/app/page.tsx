import Link from "next/link";
import MasonryGrid from "@/components/MasonryGrid";
import { loadLibrary } from "@/lib/films";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { films, groups } = await loadLibrary();

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Frame Atlas</h1>
          <p className="mt-1 text-sm text-neutral-400">
            A visual reference for documentary form. {films.length} entries across five axes.
          </p>
        </div>
        <Link
          href="/queue"
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
        >
          Review queue
        </Link>
      </header>
      <MasonryGrid films={films} groups={groups} />
    </main>
  );
}
