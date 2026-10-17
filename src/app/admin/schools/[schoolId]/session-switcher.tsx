import Link from "next/link";

type Session = { id: string; name: string };

/**
 * Which session a setup page edits (spec 0006, AC-9). Shown only when the
 * school has more than one; says so when it isn't the session teachers work in.
 */
export function SessionSwitcher({
  path,
  sessions,
  selectedId,
  currentId,
}: {
  path: string;
  sessions: Session[];
  selectedId: string;
  currentId: string | null;
}) {
  const selected = sessions.find((s) => s.id === selectedId);
  const current = sessions.find((s) => s.id === currentId);
  if (sessions.length < 2 && (!current || current.id === selectedId)) return null;
  return (
    <div className="flex flex-col gap-2">
      {sessions.length > 1 && (
        <nav aria-label="Session" className="flex flex-wrap items-center gap-3">
          <span className="type-caption font-semibold text-muted-foreground">Session</span>
          <ul className="inline-flex flex-wrap gap-0.5 rounded-lg border border-rule bg-card p-0.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`${path}?session=${s.id}`}
                  aria-current={s.id === selectedId ? "page" : undefined}
                  className="inline-flex h-10 items-center rounded-md px-3 type-label type-figure transition-colors hover:bg-accent aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {selected && current && current.id !== selected.id && (
        <p className="type-caption text-muted-foreground sm:text-sm">
          You’re setting up <strong className="text-foreground">{selected.name}</strong>. Teachers keep working in {current.name} until one of {selected.name}’s terms is made current.
        </p>
      )}
    </div>
  );
}
