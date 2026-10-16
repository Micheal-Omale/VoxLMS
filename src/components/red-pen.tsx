import { cn } from "@/lib/utils";

/**
 * A teacher's red-pen ring around something that needs fixing. The loop
 * overshoots its start the way a real pen stroke does, and draws itself once.
 * Purely visual: the error text next to it carries the meaning.
 */
export function RedPenCircle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 60"
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none absolute -top-1.5 -left-2 h-[calc(100%+0.75rem)] w-[calc(100%+1rem)] -rotate-2 overflow-visible text-destructive",
        className,
      )}
    >
      <path
        d="M58 5C84 3 98 17 96 32C94 48 71 57 46 56C21 55 3 45 4 29C5 14 25 5 50 4C61 4 71 6 78 10"
        pathLength={100}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="animate-red-pen [--pen-length:100]"
      />
    </svg>
  );
}
