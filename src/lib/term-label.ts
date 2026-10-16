const ORDINAL = ["First", "Second", "Third"];

/** "First Term, 2026/2027" */
export function termLabel(number: number, sessionName: string) {
  return `${ORDINAL[number - 1] ?? `Term ${number}`} Term, ${sessionName}`;
}
