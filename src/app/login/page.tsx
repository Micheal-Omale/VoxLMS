import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { brand } from "@/lib/brand";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:justify-center sm:py-16">
      <div className="flex w-full max-w-[26rem] flex-col gap-6">
        <Logo className="h-7 self-start" />
        <div className="ruled-sheet rounded-xl border border-rule py-7 pr-5 pl-[calc(var(--margin-x)+1.25rem)] shadow-sm [--margin-x:1.5rem] sm:py-9 sm:pr-8 sm:pl-[calc(var(--margin-x)+2rem)] sm:[--margin-x:2rem]">
          <div className="mb-7 flex flex-col gap-1.5">
            <h1 className="type-title">Sign in</h1>
            <p className="text-muted-foreground">Enter scores and print report cards for your class.</p>
          </div>
          <SignInForm />
        </div>
        <p className="px-1 type-caption text-muted-foreground sm:text-sm">
          Forgot your password?{" "}
          {brand.supportWhatsApp ? (
            <a href={`https://wa.me/${brand.supportWhatsApp}`} className="font-semibold text-primary underline underline-offset-4">
              Message us on WhatsApp
            </a>
          ) : (
            <span>Message the {brand.name} team from your registered phone</span>
          )}{" "}
          and we will send you a link to choose a new one.
        </p>
      </div>
    </main>
  );
}
