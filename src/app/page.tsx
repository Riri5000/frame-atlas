import MasonryGrid from "@/components/MasonryGrid";
import { loadLibrary } from "@/lib/films";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { films, groups } = await loadLibrary();

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Frame Atlas</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A visual reference for documentary form. {films.length} entries across five axes.
        </p>
      </header>
      <MasonryGrid films={films} groups={groups} />
    </main>
  );
}
