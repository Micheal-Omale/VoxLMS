"use client";

import { ScoreSheet } from "@/components/score-sheet/score-sheet";
import type { SaveOutcome } from "@/components/score-sheet/types";

import { demoColumns, demoColumnsFive, demoScale, demoScores, demoScoresFive, demoStudents } from "../demo-data";

// Demo data only: the real sheet saves through saveScoresAction (spec 0009).
async function fakeSave(): Promise<SaveOutcome> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return { kind: "saved", updatedAt: new Date().toISOString() };
}

const students = demoStudents.map((s, i) => ({ ...s, number: `GHS-${String(101 + i).padStart(4, "0")}` }));

/** The preview sheet; `?parts=5` shows a five part split. */
export function ScoreEntryDemo({ parts }: { parts: 3 | 5 }) {
  const five = parts === 5;
  return (
    <ScoreSheet
      key={parts}
      draftKey={`score-draft:demo:jss2-gold:mathematics:2026-1:${parts}`}
      termName="First Term"
      sheet={{ students, columns: five ? demoColumnsFive : demoColumns, scale: demoScale, scores: five ? demoScoresFive : demoScores }}
      lastSavedAt="2026-10-16T13:14:00.000Z"
      onSave={fakeSave}
    />
  );
}
