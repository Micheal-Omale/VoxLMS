import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

import { LEFT_PAGE, LOCKUP, MARK, RIGHT_PAGE, WORDMARK } from "./logo-paths";

/**
 * colour: ink left page, biro-blue right page, ink word (paper and white surfaces).
 * mono:   one colour from `currentColor` (black for photocopied report cards,
 *         white on biro blue). Never recolour the two pages in other colours.
 */
type Tone = "colour" | "mono";

const INK = "var(--foreground)";
const BLUE = "var(--primary)";

type LogoProps = {
  tone?: Tone;
  className?: string;
  /** Set when the logo is a link's only content, so the name is not read twice. */
  decorative?: boolean;
};

/** The full lockup: mark + VoxLMS. Size it by height, e.g. `h-7`. */
export function Logo({ tone = "colour", className, decorative }: LogoProps) {
  const mono = tone === "mono";
  return (
    <svg
      viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}
      className={cn("h-7 w-auto shrink-0", className)}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": brand.name })}
    >
      <path d={LEFT_PAGE} fill={mono ? "currentColor" : INK} />
      <path d={RIGHT_PAGE} fill={mono ? "currentColor" : BLUE} />
      <path d={WORDMARK} fill={mono ? "currentColor" : INK} />
    </svg>
  );
}

/** The mark alone, for tight spaces. Below 24px use the tile (app icon) instead. */
export function LogoMark({ tone = "colour", className, decorative = true }: LogoProps) {
  const mono = tone === "mono";
  return (
    <svg
      viewBox={`0 0 ${MARK.width} ${MARK.height}`}
      className={cn("h-7 w-auto shrink-0", className)}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": brand.name })}
    >
      <path d={LEFT_PAGE} fill={mono ? "currentColor" : INK} />
      <path d={RIGHT_PAGE} fill={mono ? "currentColor" : BLUE} />
    </svg>
  );
}
