import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-md gap-4 pt-16">
      <p className="font-mono text-sm text-subtle">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="text-muted">The link may be old, or the job or resume was deleted.</p>
      <div className="flex gap-3 pt-2">
        <Link href="/" className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-on transition hover:bg-accent-hover">Go home</Link>
        <Link href="/login" className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-muted transition hover:text-ink">Log in</Link>
      </div>
    </div>
  );
}
