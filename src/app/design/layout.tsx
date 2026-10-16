import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: { template: "%s · Design previews", default: "Design system" },
  robots: { index: false, follow: false },
};

// Design previews use made-up data. Hidden in production unless asked for.
export default function DesignLayout({ children }: LayoutProps<"/design">) {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DESIGN_PREVIEWS !== "1") {
    notFound();
  }
  return children;
}
