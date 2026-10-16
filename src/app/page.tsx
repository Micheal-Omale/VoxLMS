import { Logo } from "@/components/brand/logo";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1>
        <Logo className="h-10" />
      </h1>
      <p className="text-muted-foreground">Report cards for Nigerian schools.</p>
    </main>
  );
}
