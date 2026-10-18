"use client";

import { useState } from "react";

import { ScoreSheet } from "@/components/score-sheet/score-sheet";
import type { ReadOnlyReason, SheetSnapshot, SheetStudent } from "@/components/score-sheet/types";

import { saveScoresAction } from "../../../score-actions";
import { HistoryPanel } from "./history-panel";

type ScoreEntryProps = {
  slug: string;
  termId: string;
  classSubjectId: string;
  draftKey: string;
  termName: string;
  subjectName: string;
  sheet: SheetSnapshot;
  lastSavedAt: string | null;
  readOnly: ReadOnlyReason | null;
};

/** The real score sheet: saves through saveScoresAction, and the name opens the score history (spec 0009). */
export function ScoreEntry({ slug, termId, classSubjectId, draftKey, termName, subjectName, sheet, lastSavedAt, readOnly }: ScoreEntryProps) {
  const [historyFor, setHistoryFor] = useState<SheetStudent | null>(null);
  return (
    <>
      <ScoreSheet
        draftKey={draftKey}
        termName={termName}
        sheet={sheet}
        lastSavedAt={lastSavedAt}
        readOnly={readOnly}
        onSave={(request) => saveScoresAction(slug, { termId, classSubjectId, ...request })}
        onOpenHistory={setHistoryFor}
      />
      <HistoryPanel
        slug={slug}
        termId={termId}
        classSubjectId={classSubjectId}
        subjectName={subjectName}
        termName={termName}
        student={historyFor}
        onClose={() => setHistoryFor(null)}
      />
    </>
  );
}
