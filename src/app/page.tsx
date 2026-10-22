import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircleIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { CardSample } from "@/components/home/card-sample";
import { SheetSample } from "@/components/home/sheet-sample";
import { buttonVariants } from "@/components/ui/button";
import { brand, whatsAppLink } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${brand.name} · Report cards for Nigerian schools` },
  description:
    "Teachers enter scores on their phones. VoxLMS works out totals, grades and positions, prints standard Nigerian report cards, and lets parents check results with a PIN.",
};

const CONTACT_MESSAGE = "Hello VoxLMS, I'd like to use VoxLMS for my school's results.";

const STEPS = [
  {
    title: "We set up your school",
    text: "Your classes and arms, subjects, score split (like CA 1 20, CA 2 20, Exam 60), the grade scales for each section, your logo and the principal’s signature. Send us your student list in Excel and we load it.",
  },
  {
    title: "Teachers enter scores on their phones",
    text: "Each form teacher sees only their own class. A score above the maximum is circled before it is saved, and typed scores stay on the phone if the network drops.",
  },
  {
    title: "Results work themselves out",
    text: "Totals, grades, positions and class averages, worked out again whenever a score changes. A missing score is never counted as 0. The principal sees which classes are still behind, and a broadsheet for every class.",
  },
  {
    title: "Print report cards, and parents check online",
    text: "One PDF per class, ready to print on A4. Each parent gets a PIN slip to see their child’s result on a phone and download the same report card.",
  },
];

/** The public homepage: for school owners and principals deciding whether to use VoxLMS. */
export default function Home() {
  return (
    <>
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href="/" aria-label={`${brand.name} home`}>
            <Logo decorative className="h-6 sm:h-7" />
          </Link>
          <nav aria-label="For parents and staff" className="flex items-center gap-1 sm:gap-2">
            <Link href="/result" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Check a result
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-14 lg:py-20">
          <div className="flex flex-col items-start gap-5">
            <p className="type-label text-primary">For Nigerian primary and secondary schools</p>
            <h1 className="type-display text-balance sm:text-5xl sm:leading-[1.05]">Your teachers enter the scores. VoxLMS does the rest.</h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              Totals, grades and positions for every class, standard report cards ready to print, and results parents check on their phones with a PIN.
            </p>
            <ContactButton />
          </div>
          <SheetSample />
        </section>

        <section id="how" aria-labelledby="how-title" className="border-y border-rule bg-card">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 id="how-title" className="type-title">
              How a term goes
            </h2>
            <ol className="ruled-sheet mt-6 rounded-xl border border-rule [--margin-x:3rem] sm:[--margin-x:4rem]">
              {STEPS.map((step, i) => (
                <li key={step.title} className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)] border-b border-rule py-5 pr-4 last:border-b-0 sm:py-6 sm:pr-6">
                  <span className="text-center type-score text-muted-foreground" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="flex max-w-3xl flex-col gap-1 pl-4 sm:pl-6">
                    <h3 className="type-heading">{step.title}</h3>
                    <p className="text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="card-title" className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-col gap-3">
            <h2 id="card-title" className="type-title">
              The report card parents already know
            </h2>
            <p className="text-muted-foreground">
              Every subject with its CA and exam scores, the grade, and the student’s position in the subject and in the class. The class average, the highest and lowest score in
              each subject, the grade key, the form master’s and principal’s comments, and the principal’s signature. Parents can check every figure line by line.
            </p>
          </div>
          <CardSample />
        </section>

        <section id="start" aria-labelledby="start-title" className="border-t border-rule bg-card">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-12 sm:px-6 sm:py-16">
            <h2 id="start-title" className="type-title">
              Want VoxLMS for your school?
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              Send us a message on WhatsApp and we’ll get you on board. We set up your classes, subjects and students for you, and show your teachers how to enter scores.
            </p>
            <ContactButton />
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 type-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {brand.name}</p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/result" className="hover:text-foreground hover:underline">
              Check a result
            </Link>
            <Link href="/login" className="hover:text-foreground hover:underline">
              Staff sign in
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

/** WhatsApp is how schools reach us; until the support line is set, the button is left out rather than broken. */
function ContactButton() {
  const href = whatsAppLink(CONTACT_MESSAGE);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }))}>
      <MessageCircleIcon data-icon="inline-start" />
      Message us on WhatsApp
    </a>
  );
}
