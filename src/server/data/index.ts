// The only door to school data (spec 0003). Pages and Server Actions import from here.
export { readSnapshot, schoolContext, type SchoolContext } from "./context";
export * from "./errors";
export { getClassPage, listClassStudents, listHomeClasses } from "./classes";
export { getCurrentTerm, setCurrentTerm } from "./terms";
export { canonicalScore, getScoreSheet, saveScores, SCORE_INPUT, type ScoreChangeInput, type ScoresByStudent } from "./scores";
export { getGradeBands, getStudentSessionResults } from "./results";
export { linkGuardian, TooManyGuardians } from "./guardians";
export { allocateStudentNumbers } from "./students";
export { assertClassAccess, assertWritable, listMyClasses, ReadOnlySession } from "./access";
export type { Actor } from "./context";
