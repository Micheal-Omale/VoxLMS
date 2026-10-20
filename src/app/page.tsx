import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  GraduationCapIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { destinationFor } from "@/server/auth/destination";
import { getViewer } from "@/server/auth/viewer";

export const metadata: Metadata = {
  title: "VoxLMS · Report cards & results for Nigerian schools",
  description: "Modern results compilation, teacher lagging tracking, report card generation, and student result checking.",
};

export default async function Home() {
  // If the user is already signed in, immediately send them to their school or admin console
  const viewer = await getViewer();
  if (viewer) {
    const target = await destinationFor(viewer.userId, viewer.isTeam);
    redirect(target);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Top Navigation */}
      <header className="border-b border-rule bg-card/70 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="outline-none" aria-label="VoxLMS Home">
            <Logo className="h-8" />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/result"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
            >
              Check Student Result
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
              Sign in <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-20 text-center">
        <div className="flex max-w-3xl flex-col items-center gap-4">
          <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
            <SparklesIcon className="size-3.5" />
            Built for Nigerian Primary & Secondary Schools
          </Badge>

          <h1 className="type-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            Accurate term results and standard Nigerian report cards.
          </h1>

          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            One unified platform for school principals, class teachers, administrators, and parents.
            Real-time score tracking, instant broadsheets, and tamper-proof scratch card PIN checkers.
          </p>
        </div>

        {/* Portal Cards Grid */}
        <div className="mt-12 grid w-full max-w-5xl gap-6 sm:grid-cols-3 text-left">
          {/* Card 1: Teachers & Principal Portal */}
          <div className="flex flex-col justify-between rounded-2xl border border-rule bg-card p-6 shadow-xs transition-all hover:border-primary/50 hover:shadow-md">
            <div className="flex flex-col gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCapIcon className="size-6" />
              </div>
              <h2 className="type-title text-foreground">Principal & Staff Portal</h2>
              <p className="type-caption text-muted-foreground leading-relaxed">
                Log in with your phone number to enter student scores, write remarks, track lagging teachers, and inspect the master broadsheet webview.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-rule/60">
              <Link href="/login" className={cn(buttonVariants({ variant: "default" }), "w-full")}>
                Staff Sign In <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </div>
          </div>

          {/* Card 2: Parent Result PIN Checker */}
          <div className="flex flex-col justify-between rounded-2xl border border-rule bg-card p-6 shadow-xs transition-all hover:border-primary/50 hover:shadow-md">
            <div className="flex flex-col gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <KeyRoundIcon className="size-6" />
              </div>
              <h2 className="type-title text-foreground">Parents Result Checker</h2>
              <p className="type-caption text-muted-foreground leading-relaxed">
                Type the 8-digit code from your child’s scratch card or result slip to see their official term grades and download their A4 report card.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-rule/60">
              <Link href="/result" className={cn(buttonVariants({ variant: "outline" }), "w-full hover:bg-primary hover:text-primary-foreground")}>
                Check Result (PIN) <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </div>
          </div>

          {/* Card 3: School Admin Console */}
          <div className="flex flex-col justify-between rounded-2xl border border-rule bg-card p-6 shadow-xs transition-all hover:border-primary/50 hover:shadow-md">
            <div className="flex flex-col gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheckIcon className="size-6" />
              </div>
              <h2 className="type-title text-foreground">School Administration</h2>
              <p className="type-caption text-muted-foreground leading-relaxed">
                Configure school branding, class arms, subjects, assessment splits, term dates, and generate result PIN batches.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-rule/60">
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "w-full hover:bg-primary hover:text-primary-foreground")}>
                Admin Console <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </div>
          </div>
        </div>

        {/* Feature Highlights Banner */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground sm:text-sm">
          <span className="flex items-center gap-1.5">
            <CheckCircle2Icon className="size-4 text-success" />
            Automatic totals, ranks & averages
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2Icon className="size-4 text-success" />
            Full CA 1, CA 2 & Exam breakdown
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2Icon className="size-4 text-success" />
            Luhn check-digit result PIN security
          </span>
        </div>

        {/* Quick Previews Footer Note */}
        <div className="mt-8 rounded-xl border border-rule/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          Development Previews:{" "}
          <Link href="/design/principal" className="font-semibold text-primary underline underline-offset-4">
            Principal Portal Preview
          </Link>
          {" · "}
          <Link href="/design/broadsheet" className="font-semibold text-primary underline underline-offset-4">
            Master Broadsheet Preview
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-rule py-6 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <p>© {new Date().getFullYear()} {brand.name}. All rights reserved.</p>
          {brand.supportWhatsApp && (
            <a
              href={`https://wa.me/${brand.supportWhatsApp}`}
              className="text-primary hover:underline"
            >
              Need help? WhatsApp Support
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
