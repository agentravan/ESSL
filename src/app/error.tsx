'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-stone-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-stone-600">The page could not be shown. Nothing was changed. Try again; if it keeps happening, the database may be unreachable.</p>
        <button type="button" onClick={reset} className="btn-primary mt-5">Try again</button>
      </div>
    </main>
  );
}
