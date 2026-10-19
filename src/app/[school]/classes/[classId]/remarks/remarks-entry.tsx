"use client";

import { RemarksSheet } from "@/components/remarks-sheet/remarks-sheet";
import type { ReadOnlyReason, RemarksSnapshot } from "@/components/remarks-sheet/types";

import { saveRemarksAction } from "../../remark-actions";

type RemarksEntryProps = {
  slug: string;
  termId: string;
  classId: string;
  draftKey: string;
  termName: string;
  signerTitle: string;
  sheet: RemarksSnapshot;
  readOnly: ReadOnlyReason | null;
};

/** The real Remarks sheet: saves through saveRemarksAction (spec 0011). */
export function RemarksEntry({ slug, termId, classId, ...props }: RemarksEntryProps) {
  return <RemarksSheet {...props} onSave={(request) => saveRemarksAction(slug, { termId, classId, ...request })} />;
}
