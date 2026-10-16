"use client";

import { ScoreSheet } from "@/components/score-sheet/score-sheet";

import { demoColumns, demoScale, demoScores, demoStudents } from "../demo-data";

// Stands in for the real Server Action until Score entry is built.
async function fakeSave() {
  await new Promise((resolve) => setTimeout(resolve, 900));
}

export function ScoreEntryDemo() {
  return (
    <ScoreSheet
      sheetId="demo:jss2-gold:mathematics:2026-1"
      students={demoStudents}
      columns={demoColumns}
      scale={demoScale}
      initialScores={demoScores}
      lastSavedAt="2026-10-16T13:14:00.000Z"
      onSave={fakeSave}
    />
  );
}
