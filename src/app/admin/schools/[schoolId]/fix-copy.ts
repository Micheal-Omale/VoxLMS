import type { FixConfirm } from "./confirm-fix";

// The confirms before a fix that changes reprints too (spec 0007, AC-2 to AC-4).
// No history is kept, so each one says past terms change as well.

export const principalFix = (what: "name" | "signature"): FixConfirm => ({
  title: what === "name" ? "Change the principal on report cards?" : "Replace the principal’s signature?",
  description: "This shows on every report card the principal signs, reprints of past terms included.",
  action: what === "name" ? "Save the change" : "Use the new signature",
});

export const headFix = (section: string, what: "name" | "signature"): FixConfirm => ({
  title: what === "name" ? `Change ${section}’s head on report cards?` : `Replace the signature of ${section}’s head?`,
  description: `This shows on every ${section} report card, reprints of past terms included.`,
  action: what === "name" ? "Save the change" : "Use the new signature",
});

export const headOff = (section: string, head: string): FixConfirm => ({
  title: `Let the principal sign ${section}’s report cards?`,
  description: `The principal will sign ${section}’s report cards, reprints of past terms included. ${head}’s name and signature will be removed.`,
  action: "Remove the head",
  removes: true,
});
