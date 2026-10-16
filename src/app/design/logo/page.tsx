import Link from "next/link";
import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";

import { Logo, LogoMark } from "@/components/brand/logo";
import { LEFT_PAGE, MARK, RIGHT_PAGE } from "@/components/brand/logo-paths";
import { RedPenCircle } from "@/components/red-pen";
import { Button } from "@/components/ui/button";

import { Section } from "../section";

export const metadata: Metadata = { title: "Logo" };

const downloads = [
  { file: "voxlms-logo.svg", label: "Logo, colour" },
  { file: "voxlms-logo-black.svg", label: "Logo, black" },
  { file: "voxlms-logo-white.svg", label: "Logo, white" },
  { file: "voxlms-mark.svg", label: "Mark, colour" },
  { file: "voxlms-app-icon.svg", label: "App icon, SVG" },
  { file: "voxlms-app-icon-512.png", label: "App icon, PNG 512px" },
];

export default function LogoPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-8">
        <Link href="/design" className="type-caption font-semibold text-muted-foreground hover:text-foreground">
          Design system
        </Link>
        <div className="flex items-center justify-center rounded-xl border border-rule bg-card px-6 py-16 sm:py-24">
          <Logo className="h-14 sm:h-20" />
        </div>
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="type-display">The VoxLMS logo</h1>
          <p className="text-lg text-muted-foreground">
            Two pages of an open book, joined at the spine and standing on a ruled line. The short
            page and the tall page together make a teacher&rsquo;s tick and the V of Vox: learning,
            marked and checked.
          </p>
        </div>
      </header>

      <Section title="Construction" intro="Every part has a reason. Keep these relationships when the logo is redrawn or animated.">
        <div className="grid gap-6 rounded-xl border border-rule bg-card p-6 sm:p-10 md:grid-cols-[1.2fr_1fr] md:items-center">
          <Construction />
          <dl className="flex flex-col gap-4">
            {[
              ["Two pages", "A short left page in ink and a tall right page in biro blue. Read together they are a tick."],
              ["The spine", "Where the blue page lies over the ink page. The pages always meet; pulled apart, the mark looks unfinished."],
              ["The ruled line", "Both pages stand on the same baseline, the line the wordmark sits on."],
              ["The wordmark", "Atkinson Hyperlegible Next Bold, outlined, with “Vox” set tight and the capitals “LMS” set open."],
            ].map(([term, detail]) => (
              <div key={term} className="flex flex-col gap-0.5">
                <dt className="font-bold">{term}</dt>
                <dd className="text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section title="Versions" intro="Colour wherever we can. One colour where we must: report cards are printed in black and photocopied.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Swatch label="Colour, on paper or white" className="bg-card">
            <Logo className="h-9" />
          </Swatch>
          <Swatch label="White, on biro blue" className="bg-primary text-primary-foreground">
            <Logo tone="mono" className="h-9" />
          </Swatch>
          <Swatch label="Black, for report cards and print" className="bg-white text-black">
            <Logo tone="mono" className="h-9" />
          </Swatch>
          <Swatch label="Mark and app icon, for small spaces" className="bg-card">
            <div className="flex items-end gap-6">
              <LogoMark className="h-10" />
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/brand/voxlms-app-icon.svg" alt="" className="size-12" />
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/brand/voxlms-app-icon.svg" alt="" className="size-6" />
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/brand/voxlms-app-icon.svg" alt="" className="size-4" />
            </div>
          </Swatch>
        </div>
      </Section>

      <Section
        title="Space and size"
        intro="Leave clear space of half the logo’s height on every side. On screen the logo is at least 18px tall; in print, at least 6mm. Below that, use the app icon."
      >
        <div className="flex flex-wrap items-end gap-10 rounded-xl border border-rule bg-card p-6 sm:p-10">
          <div className="relative p-[1.125rem] outline-2 outline-offset-0 outline-dashed outline-rule">
            <Logo className="h-9" />
          </div>
          <div className="flex items-end gap-6">
            <figure className="flex flex-col gap-2">
              <Logo className="h-[18px]" />
              <figcaption className="type-caption text-muted-foreground">Smallest: 18px</figcaption>
            </figure>
            <figure className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img src="/brand/voxlms-app-icon.svg" alt="" className="size-4" />
              <figcaption className="type-caption text-muted-foreground">Below that: icon</figcaption>
            </figure>
          </div>
        </div>
      </Section>

      <Section title="Don’t" intro="Marked the way a teacher would. Each of these breaks the idea or the legibility.">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Misuse label="Don’t recolour the pages">
            <svg viewBox={`0 0 ${MARK.width} ${MARK.height}`} className="h-10 w-auto" aria-hidden="true">
              <path d={LEFT_PAGE} fill="#0b6b4c" />
              <path d={RIGHT_PAGE} fill="#c8202f" />
            </svg>
          </Misuse>
          <Misuse label="Don’t stretch or squash it">
            <Logo className="h-6 w-36 scale-x-125" />
          </Misuse>
          <Misuse label="Don’t add shadows or gradients">
            <Logo className="h-6 drop-shadow-[0_3px_3px_rgb(22_34_74/0.45)]" />
          </Misuse>
          <Misuse label="Don’t retype the name in another font">
            <span className="flex items-center gap-2">
              <LogoMark className="h-6" />
              <span className="font-serif text-2xl italic">VoxLMS</span>
            </span>
          </Misuse>
          <Misuse label="Don’t pull the pages apart">
            <svg viewBox="-11 0 61 41" className="h-10 w-auto" aria-hidden="true">
              <path d={LEFT_PAGE} fill="var(--foreground)" transform="translate(-10 0)" />
              <path d={RIGHT_PAGE} fill="var(--primary)" />
            </svg>
          </Misuse>
          <Misuse label="Don’t use the colour logo on blue" className="bg-primary">
            <Logo className="h-6" />
          </Misuse>
        </ul>
      </Section>

      <Section title="Files" intro="Vector files for anything printed or shared. The wordmark is outlined, so it looks the same without the font installed.">
        <ul className="flex flex-wrap gap-3">
          {downloads.map((item) => (
            <li key={item.file}>
              <Button variant="outline" nativeButton={false} render={<Link href={`/brand/${item.file}`} download />}>
                <DownloadIcon data-icon="inline-start" />
                {item.label}
              </Button>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function Construction() {
  const pad = 6;
  const w = MARK.width + pad * 2;
  const h = MARK.height + pad * 2;
  const base = pad + MARK.height;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm justify-self-center" role="img" aria-label="The mark with its baseline and spine marked">
      <line x1="0" x2={w} y1={base} y2={base} stroke="var(--rule)" strokeWidth="0.5" />
      <line x1="0" x2={w} y1={pad} y2={pad} stroke="var(--rule)" strokeWidth="0.3" strokeDasharray="1 1" />
      <g transform={`translate(${pad} ${pad})`}>
        <path d={LEFT_PAGE} fill="var(--foreground)" />
        <path d={RIGHT_PAGE} fill="var(--primary)" />
      </g>
      <circle cx={pad + 19.6} cy={base - 2.2} r="3.2" fill="none" stroke="var(--destructive)" strokeWidth="0.35" />
    </svg>
  );
}

function Swatch({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className={`flex h-36 items-center justify-center rounded-xl border border-rule ${className ?? ""}`}>{children}</div>
      <figcaption className="type-caption text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function Misuse({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2">
      <div className={`relative flex h-28 items-center justify-center overflow-hidden rounded-xl border border-rule ${className ?? "bg-card"}`}>
        <div className="relative px-3 py-2">
          {children}
          <RedPenCircle className="-top-3 -left-4 h-[calc(100%+1.5rem)] w-[calc(100%+2rem)]" />
        </div>
      </div>
      <p className="type-caption font-semibold text-destructive">{label}</p>
    </li>
  );
}
