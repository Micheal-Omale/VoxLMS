const ORDINAL = ["First", "Second", "Third"];

/** "First Term" */
export function termName(number: number) {
  return `${ORDINAL[number - 1] ?? `Term ${number}`} Term`;
}

/** "First Term, 2026/2027" */
export function termLabel(number: number, sessionName: string) {
  return `${termName(number)}, ${sessionName}`;
}
