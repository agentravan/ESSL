import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-stone-900">Page not found</h1>
        <p className="mt-2 text-sm text-stone-600">That page does not exist, or you do not have access to it.</p>
        <Link href="/" className="btn-primary mt-5">Go to the start page</Link>
      </div>
    </main>
  );
}
