import type { Metadata } from "next";

import { PrincipalDashboard } from "@/components/principal/principal-dashboard";
import type { PrincipalOverview } from "@/server/data";

export const metadata: Metadata = { title: "Principal home" };

export default function PrincipalDesignPreview() {
  const sampleOverview: PrincipalOverview = {
    school: {
      id: "demo-school-id",
      name: "Grace High School, Gbagada",
      slug: "ghs",
      principalName: "Mr Samuel Adeleke",
      principalTitle: "Principal",
    },
    term: {
      id: "term-1-id",
      number: 1,
      isCurrent: true,
      resultsReleasedAt: null,
    },
    session: {
      id: "session-2026-id",
      name: "2026/2027",
    },
    summary: {
      totalClasses: 6,
      totalStudents: 168,
      totalSubjectOfferings: 54,
      completedSubjectOfferings: 44,
      overallScorePercent: 81,
      totalRemarksExpected: 168,
      totalRemarksEntered: 114,
      overallRemarkPercent: 68,
      upToDateClasses: 2,
      laggingClasses: 4,
    },
    sections: [
      {
        id: "junior-sec-id",
        name: "Junior Secondary School",
        classes: [
          {
            id: "jss-1-gold",
            name: "JSS 1 Gold",
            sectionId: "junior-sec-id",
            sectionName: "Junior Secondary School",
            teacher: {
              id: "teacher-funke",
              title: "Mrs",
              fullName: "Funke Adewale",
              phone: "0803 123 4567",
            },
            totalStudents: 28,
            scores: {
              totalSubjects: 9,
              completedSubjects: 9,
              percent: 100,
              unfinished: [],
            },
            remarks: {
              totalStudents: 28,
              entered: 28,
              pending: 0,
              percent: 100,
            },
            status: "up_to_date",
          },
          {
            id: "jss-2-diamond",
            name: "JSS 2 Diamond",
            sectionId: "junior-sec-id",
            sectionName: "Junior Secondary School",
            teacher: {
              id: "teacher-ibrahim",
              title: "Mr",
              fullName: "Ibrahim Musa",
              phone: "0805 987 6543",
            },
            totalStudents: 30,
            scores: {
              totalSubjects: 9,
              completedSubjects: 7,
              percent: 78,
              unfinished: [
                {
                  classSubjectId: "cs-btech",
                  name: "Basic Technology",
                  complete: 12,
                  takers: 30,
                  isElective: false,
                  missingCount: 18,
                },
                {
                  classSubjectId: "cs-cmp",
                  name: "Computer Studies",
                  complete: 0,
                  takers: 30,
                  isElective: false,
                  missingCount: 30,
                },
              ],
            },
            remarks: {
              totalStudents: 30,
              entered: 18,
              pending: 12,
              percent: 60,
            },
            status: "scores_lagging",
          },
          {
            id: "jss-3-emerald",
            name: "JSS 3 Emerald",
            sectionId: "junior-sec-id",
            sectionName: "Junior Secondary School",
            teacher: {
              id: "teacher-chioma",
              title: "Miss",
              fullName: "Chioma Eze",
              phone: "0812 345 6789",
            },
            totalStudents: 26,
            scores: {
              totalSubjects: 9,
              completedSubjects: 9,
              percent: 100,
              unfinished: [],
            },
            remarks: {
              totalStudents: 26,
              entered: 8,
              pending: 18,
              percent: 31,
            },
            status: "remarks_lagging",
          },
        ],
      },
      {
        id: "senior-sec-id",
        name: "Senior Secondary School",
        classes: [
          {
            id: "ss-1-science",
            name: "SS 1 Science",
            sectionId: "senior-sec-id",
            sectionName: "Senior Secondary School",
            teacher: {
              id: "teacher-babatunde",
              title: "Mr",
              fullName: "Babatunde Raji",
              phone: "0802 444 5555",
            },
            totalStudents: 32,
            scores: {
              totalSubjects: 10,
              completedSubjects: 4,
              percent: 40,
              unfinished: [
                {
                  classSubjectId: "cs-phy",
                  name: "Physics",
                  complete: 14,
                  takers: 32,
                  isElective: false,
                  missingCount: 18,
                },
                {
                  classSubjectId: "cs-chm",
                  name: "Chemistry",
                  complete: 10,
                  takers: 32,
                  isElective: false,
                  missingCount: 22,
                },
                {
                  classSubjectId: "cs-fmt",
                  name: "Further Mathematics",
                  complete: 0,
                  takers: 16,
                  isElective: true,
                  missingCount: 16,
                },
              ],
            },
            remarks: {
              totalStudents: 32,
              entered: 5,
              pending: 27,
              percent: 16,
            },
            status: "severely_lagging",
          },
          {
            id: "ss-2-arts",
            name: "SS 2 Arts",
            sectionId: "senior-sec-id",
            sectionName: "Senior Secondary School",
            teacher: {
              id: "teacher-ngozi",
              title: "Mrs",
              fullName: "Ngozi Okon",
              phone: "0813 999 8888",
            },
            totalStudents: 27,
            scores: {
              totalSubjects: 8,
              completedSubjects: 8,
              percent: 100,
              unfinished: [],
            },
            remarks: {
              totalStudents: 27,
              entered: 27,
              pending: 0,
              percent: 100,
            },
            status: "up_to_date",
          },
          {
            id: "ss-3-commercial",
            name: "SS 3 Commercial",
            sectionId: "senior-sec-id",
            sectionName: "Senior Secondary School",
            teacher: {
              id: "teacher-usman",
              title: "Alhaji",
              fullName: "Usman Bello",
              phone: "0807 111 2222",
            },
            totalStudents: 25,
            scores: {
              totalSubjects: 9,
              completedSubjects: 7,
              percent: 78,
              unfinished: [
                {
                  classSubjectId: "cs-eco",
                  name: "Economics",
                  complete: 0,
                  takers: 25,
                  isElective: false,
                  missingCount: 25,
                },
              ],
            },
            remarks: {
              totalStudents: 25,
              entered: 25,
              pending: 0,
              percent: 100,
            },
            status: "scores_lagging",
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PrincipalDashboard data={sampleOverview} />
    </main>
  );
}
