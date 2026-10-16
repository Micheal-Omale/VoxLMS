import { standardLevel, standardSubject } from "../schema";
import type { SeedDb } from "./client";

// Shared lists seeded on every branch (spec 0003, AC-12). Safe to run again.

const levels = [
  ["CRECHE", "Creche", "nursery"],
  ["NUR1", "Nursery 1", "nursery"],
  ["NUR2", "Nursery 2", "nursery"],
  ["KG", "Kindergarten", "nursery"],
  ["PRY1", "Primary 1", "primary"],
  ["PRY2", "Primary 2", "primary"],
  ["PRY3", "Primary 3", "primary"],
  ["PRY4", "Primary 4", "primary"],
  ["PRY5", "Primary 5", "primary"],
  ["PRY6", "Primary 6", "primary"],
  ["JSS1", "JSS 1", "junior_secondary"],
  ["JSS2", "JSS 2", "junior_secondary"],
  ["JSS3", "JSS 3", "junior_secondary"],
  ["SS1", "SS 1", "senior_secondary"],
  ["SS2", "SS 2", "senior_secondary"],
  ["SS3", "SS 3", "senior_secondary"],
] as const;

const subjects = [
  ["MATH", "Mathematics"],
  ["ENG", "English Language"],
  ["BSC", "Basic Science"],
  ["BTECH", "Basic Technology"],
  ["SOS", "Social Studies"],
  ["CIV", "Civic Education"],
  ["NVE", "National Values Education"],
  ["PVS", "Pre-Vocational Studies"],
  ["CRS", "Christian Religious Studies"],
  ["IRS", "Islamic Religious Studies"],
  ["YOR", "Yoruba"],
  ["IGB", "Igbo"],
  ["HAU", "Hausa"],
  ["FRE", "French"],
  ["CCA", "Cultural and Creative Arts"],
  ["PHE", "Physical and Health Education"],
  ["COMP", "Computer Studies"],
  ["AGR", "Agricultural Science"],
  ["HEC", "Home Economics"],
  ["BUS", "Business Studies"],
  ["HIST", "History"],
  ["QR", "Quantitative Reasoning"],
  ["VR", "Verbal Reasoning"],
  ["BIO", "Biology"],
  ["CHEM", "Chemistry"],
  ["PHY", "Physics"],
  ["FMATH", "Further Mathematics"],
  ["GEO", "Geography"],
  ["ECON", "Economics"],
  ["GOV", "Government"],
  ["LIT", "Literature in English"],
  ["ACC", "Financial Accounting"],
  ["COMM", "Commerce"],
  ["TD", "Technical Drawing"],
  ["DP", "Data Processing"],
  ["VA", "Visual Arts"],
  ["MUS", "Music"],
] as const;

export async function seedStandardLists(db: SeedDb) {
  await db
    .insert(standardLevel)
    .values(levels.map(([code, name, stage], i) => ({ code, name, stage, sortOrder: i + 1 })))
    .onConflictDoNothing({ target: standardLevel.code });
  await db
    .insert(standardSubject)
    .values(subjects.map(([code, name]) => ({ code, name })))
    .onConflictDoNothing();
  return { levels: levels.length, subjects: subjects.length };
}
