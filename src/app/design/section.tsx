export function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h2 className="type-title">{title}</h2>
        <p className="text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  );
}
