import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";

import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brand } from "@/lib/brand";
import "./globals.css";

// Designed by the Braille Institute so 1, l and I (and 0 and O) never look
// alike: the right face for scores and admission numbers (docs/design.md).
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  display: "swap",
  // next/font has no metrics for this face, so name the fallbacks ourselves.
  adjustFontFallback: false,
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: { template: `%s · ${brand.name}`, default: brand.name },
  description: "Report cards for Nigerian schools",
};

export const viewport: Viewport = {
  themeColor: "#f3f6f9",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={`${atkinson.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Toaster>
          <TooltipProvider>{children}</TooltipProvider>
        </Toaster>
      </body>
    </html>
  );
}
