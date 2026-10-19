// The only door to school data (spec 0003). Pages and Server Actions import from here.
export { readSnapshot, schoolContext, type SchoolContext } from "./context";
export * from "./errors";
export { getClassPage, listClassStudents, listHomeClasses } from "./classes";
export { getCurrentTerm, setCurrentTerm } from "./terms";
export {
  canonicalScore,
  getScoreHistory,
  getScoreProgress,
  getScoreSheet,
  listSubjectProgress,
  saveScores,
  SCORE_INPUT,
  type ScoreChangeInput,
  type ScoreHistory,
  type ScoresByStudent,
  type ScoreSheetData,
} from "./scores";
export { type ClassResults, getClassResults, getGradeBands, getStudentSessionResults, loadClassResults } from "./results";
export { linkGuardian, TooManyGuardians } from "./guardians";
export { allocateStudentNumbers } from "./students";
export { assertClassAccess, assertWritable, listMyClasses, ReadOnlySession } from "./access";
export type { Actor } from "./context";
export {
  type ClassRemarks,
  getClassRemarks,
  getRemarkBands,
  loadClassRemarks,
  type RemarkChangeInput,
  type RemarkField,
  type RemarkRow,
  saveRemarkBands,
  saveRemarks,
} from "./remarks";
export { getReportCards, loadReportCards, type ReportCardsData } from "./report-cards";
export { assertTermsOpen, sessionTermIds } from "./release";
