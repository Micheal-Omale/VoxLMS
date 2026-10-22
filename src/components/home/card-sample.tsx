// A made up report card in the printed layout (spec 0012), shrunk for the
// homepage. Black on white like the paper one; only the figures matter.
const SUBJECTS = [
  {
    name: "English Studies",
    parts: ["16", "15", "47"],
    total: "78",
    grade: "A",
    position: "3rd",
  },
  {
    name: "Mathematics",
    parts: ["15", "17", "48"],
    total: "80",
    grade: "A",
    position: "2nd",
  },
  {
    name: "Basic Science",
    parts: ["12", "14", "36"],
    total: "62",
    grade: "B",
    position: "9th",
  },
  {
    name: "Social Studies",
    parts: ["14", "13", "40"],
    total: "67",
    grade: "B",
    position: "6th",
  },
  {
    name: "Yoruba",
    parts: ["11", "12", "31"],
    total: "54",
    grade: "C",
    position: "14th",
  },
];

const FACTS = [
  ["Position in class", "5th of 32"],
  ["Average", "68.20"],
  ["Class average", "57.45"],
];

export function CardSample() {
  return (
    <figure aria-label="A sample report card" className="rounded-xl border border-rule bg-card p-4 text-foreground shadow-sm sm:p-6">
      <div className="border-b border-foreground pb-2 text-center">
        <p className="font-bold">GRACE HIGH SCHOOL, GBAGADA</p>
        <p className="type-caption">Report card · First Term, 2026/2027</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 py-3 type-caption">
        <p>
          <span className="text-muted-foreground">Name</span> <span className="font-semibold">ABUBAKAR Sadiq</span>
        </p>
        <p>
          <span className="text-muted-foreground">Class</span> <span className="font-semibold">JSS 2 Gold</span>
        </p>
        {FACTS.map(([label, value]) => (
          <p key={label}>
            <span className="text-muted-foreground">{label}</span> <span className="type-figure font-semibold">{value}</span>
          </p>
        ))}
      </div>
      <table className="w-full border-collapse type-caption">
        <thead>
          <tr className="border-y border-foreground">
            <th scope="col" className="py-1 pr-2 text-left font-semibold">
              Subject
            </th>
            {["CA 1", "CA 2", "Exam", "Total"].map((h, i) => (
              <th key={h} scope="col" className={i < 3 ? "px-1 py-1 text-right font-semibold max-sm:hidden" : "px-1 py-1 text-right font-semibold"}>
                {h}
              </th>
            ))}
            <th scope="col" className="px-1 py-1 text-center font-semibold">
              Grade
            </th>
            <th scope="col" className="py-1 pl-1 text-right font-semibold">
              Position
            </th>
          </tr>
        </thead>
        <tbody>
          {SUBJECTS.map((s) => (
            <tr key={s.name} className="border-b border-rule">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {s.name}
              </th>
              {s.parts.map((p, i) => (
                <td key={i} className="px-1 py-1 text-right type-figure max-sm:hidden">
                  {p}
                </td>
              ))}
              <td className="px-1 py-1 text-right type-figure font-bold">{s.total}</td>
              <td className="px-1 py-1 text-center font-bold">{s.grade}</td>
              <td className="py-1 pl-1 text-right type-figure">{s.position}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 grid gap-2 type-caption sm:grid-cols-2">
        <p>
          <span className="block font-semibold">Form master’s comment</span>
          Sadiq is steady and careful. More reading at home will lift his Yoruba.
        </p>
        <p>
          <span className="block font-semibold">Principal’s comment</span>A very good result. Keep it up.
        </p>
      </div>
    </figure>
  );
}
