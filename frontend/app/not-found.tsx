import Link from "next/link";
import { EmptyStack } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-lg justify-items-center gap-4 pt-16 text-center">
      <div className="relative">
        <p aria-hidden className="select-none bg-gradient-to-b from-ink/15 to-transparent bg-clip-text font-mono text-[8rem] font-semibold leading-none tracking-tighter text-transparent [transform:perspective(500px)_rotateX(24deg)]">404</p>
        <div className="absolute inset-x-0 bottom-0"><EmptyStack /></div>
      </div>
      <h1 className="mt-4 text-[1.75rem] font-semibold tracking-[-0.025em]">This page does not exist</h1>
      <p className="text-muted">The link may be old, or the job or resume was deleted.</p>
      <div className="flex gap-3 pt-2">
        <Link href="/" className="inline-flex h-10 items-center rounded-md bg-gradient-to-b from-accent to-accent-hover px-4 text-sm font-medium text-accent-on shadow-button transition hover:-translate-y-px hover:brightness-110">Go home</Link>
        <Link href="/login" className="inline-flex h-10 items-center rounded-md bg-surface px-4 text-sm font-medium text-ink shadow-key transition hover:-translate-y-px">Log in</Link>
      </div>
    </div>
  );
}
