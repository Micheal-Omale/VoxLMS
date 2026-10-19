import "server-only";

import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { LEFT_PAGE, LOCKUP, RIGHT_PAGE, WORDMARK } from "@/components/brand/logo-paths";
import type { ReportCardModel } from "@/lib/report-card";

import { CARD_FONT, registerCardFonts } from "./fonts";

// The standard report card (spec 0012): one A4 page per card, drawn for black
// and white printing and photocopying (AC-9). Black text and black lines
// only, no line under 0.5 point, body 9 point, nothing under 7.5 point. Every
// string comes ready made from `buildReportCards`; nothing here formats or
// counts. The class file (#12), the reprint (#15) and the PIN page (#21) all
// draw cards with this one component.

const INK = "#000000";
const HAIR = 0.5;

// Subject table widths (539 points in all). Five parts use 150; fewer parts
// give their width to Subject and Remark, half each.
const WIDTH = { subject: 118, part: 30, total: 34, grade: 28, position: 34, classAverage: 38, highest: 30, lowest: 30 } as const;
const CONTENT = 539;

function columnWidths(parts: number) {
  const spare = (5 - Math.min(parts, 5)) * WIDTH.part;
  const subject = WIDTH.subject + Math.floor(spare / 2);
  const fixed = subject + parts * WIDTH.part + WIDTH.total + WIDTH.grade + WIDTH.position + WIDTH.classAverage + WIDTH.highest + WIDTH.lowest;
  return { subject, remark: CONTENT - fixed };
}

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 28, paddingHorizontal: 28, fontFamily: CARD_FONT, fontSize: 9, color: INK },

  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 56, height: 56, objectFit: "contain" },
  schoolText: { flex: 1, alignItems: "center", textAlign: "center" },
  schoolName: { fontSize: 15, fontWeight: "bold", textAlign: "center", lineHeight: 1.15 },
  headerLine: { fontSize: 8, textAlign: "center", marginTop: 1.5 },
  // Keeps the name centred on the page when a logo sits at the left.
  logoBalance: { width: 56 },

  title: { marginTop: 8, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: INK, fontSize: 11, fontWeight: "bold" },

  studentBlock: { flexDirection: "row", gap: 16, marginTop: 7 },
  pairs: { flex: 1 },
  pair: { flexDirection: "row", paddingVertical: 0.5, fontSize: 9, lineHeight: 1.2 },
  label: { width: 96 },
  value: { flex: 1, fontWeight: "bold" },
  figure: { fontFeatureSettings: ["tnum"] },

  table: { marginTop: 8, borderWidth: HAIR, borderColor: INK },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, minHeight: 22 },
  row: { flexDirection: "row", borderTopWidth: HAIR, borderTopColor: INK, minHeight: 15 },
  firstRow: { borderTopWidth: 0 },
  cell: { justifyContent: "center", paddingHorizontal: 2, paddingVertical: 1, borderLeftWidth: HAIR, borderLeftColor: INK },
  firstCell: { borderLeftWidth: 0 },
  headText: { fontSize: 7.5, fontWeight: "bold", lineHeight: 1.1 },
  bodyText: { fontSize: 8.5, lineHeight: 1.15 },
  remarkText: { fontSize: 7.5, lineHeight: 1.05 },
  right: { textAlign: "right" },
  centre: { textAlign: "center" },

  gradeKey: { marginTop: 3, fontSize: 7.5, lineHeight: 1.25 },

  comments: { marginTop: 8, gap: 6 },
  commentHeading: { fontWeight: "bold" },
  // react-pdf multiplies a bare lineHeight by its own default size unless fontSize sits beside it.
  commentText: { marginTop: 1.5, fontSize: 9, lineHeight: 1.3 },
  writeLine: { height: 13, borderBottomWidth: HAIR, borderBottomColor: INK },
  signedBy: { flexDirection: "row", alignItems: "flex-end", marginTop: 5, gap: 8 },
  handLine: { width: 120, height: 11, borderBottomWidth: HAIR, borderBottomColor: INK },

  signature: { marginTop: 8, alignSelf: "flex-end", width: 240, alignItems: "center" },
  signatureImage: { maxHeight: 36, maxWidth: 200, objectFit: "contain" },
  signatureSpace: { height: 36 },
  signatureLine: { alignSelf: "stretch", borderTopWidth: HAIR, borderTopColor: INK, marginTop: 2 },
  signerName: { marginTop: 2, fontWeight: "bold", textAlign: "center" },
  signerTitle: { fontSize: 8, textAlign: "center" },

  footer: { marginTop: "auto", paddingTop: 4, borderTopWidth: HAIR, borderTopColor: INK, flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 18 },
  footerText: { fontSize: 7.5 },
  poweredBy: { flexDirection: "row", alignItems: "center", gap: 4 },
});

/** The black VoxLMS lockup, 17 points (6 mm) tall: react-pdf can't draw an SVG file, so the paths are drawn here. */
function VoxLogo() {
  const height = 17;
  return (
    <Svg width={(height * LOCKUP.width) / LOCKUP.height} height={height} viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}>
      <Path d={LEFT_PAGE} fill={INK} />
      <Path d={RIGHT_PAGE} fill={INK} />
      <Path d={WORDMARK} fill={INK} />
    </Svg>
  );
}

function Pair({ label, value, figure = false }: { label: string; value: string; figure?: boolean }) {
  return (
    <View style={s.pair}>
      <Text style={s.label}>{label}</Text>
      <Text style={figure ? [s.value, s.figure] : s.value}>{value}</Text>
    </View>
  );
}

function Card({ card }: { card: ReportCardModel }) {
  const { school, student, columns, rows } = card;
  const widths = columnWidths(columns.parts.length);
  const figureCell = (width: number, first = false) => [s.cell, ...(first ? [s.firstCell] : []), { width }];
  const headers = [
    ...columns.parts.map((label) => ({ label, width: WIDTH.part })),
    { label: columns.total, width: WIDTH.total },
  ];

  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        {school.logo && (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the school name sits beside it.
          <Image src={school.logo} style={s.logo} />
        )}
        <View style={s.schoolText}>
          <Text style={s.schoolName}>{school.name}</Text>
          {school.address && <Text style={s.headerLine}>{school.address}</Text>}
          {school.contact && <Text style={[s.headerLine, s.figure]}>{school.contact}</Text>}
          {school.motto && <Text style={s.headerLine}>Motto: {school.motto}</Text>}
        </View>
        {school.logo && <View style={s.logoBalance} />}
      </View>

      <Text style={s.title}>{card.title}</Text>

      <View style={s.studentBlock}>
        <View style={s.pairs}>
          <Pair label="Name" value={`${student.surname} ${student.otherNames}`} />
          <Pair label={student.idLabel} value={student.id} figure />
          <Pair label="Class" value={student.className} />
          <Pair label="Gender" value={student.gender} />
          {student.nextTermBegins && <Pair label="Next term begins" value={student.nextTermBegins} />}
        </View>
        <View style={s.pairs}>
          <Pair label="Subjects taken" value={student.subjectsTaken} figure />
          <Pair label="Number in class" value={student.numberInClass} figure />
          <Pair label="Position in class" value={student.position} figure />
          <Pair label="Total score" value={student.total} figure />
          <Pair label="Average" value={student.average} figure />
          <Pair label="Class average" value={student.classAverage} figure />
        </View>
      </View>

      <View style={s.table}>
        <View style={s.headRow}>
          <View style={[s.cell, s.firstCell, { width: widths.subject }]}>
            <Text style={s.headText}>Subject</Text>
          </View>
          {headers.map((h, i) => (
            <View key={i} style={figureCell(h.width)}>
              <Text style={[s.headText, s.right]}>{h.label}</Text>
            </View>
          ))}
          <View style={figureCell(WIDTH.grade)}>
            <Text style={[s.headText, s.centre]}>Grade</Text>
          </View>
          <View style={figureCell(WIDTH.position)}>
            <Text style={[s.headText, s.right]}>Position</Text>
          </View>
          <View style={figureCell(WIDTH.classAverage)}>
            <Text style={[s.headText, s.right]}>Class average</Text>
          </View>
          <View style={figureCell(WIDTH.highest)}>
            <Text style={[s.headText, s.right]}>Highest</Text>
          </View>
          <View style={figureCell(WIDTH.lowest)}>
            <Text style={[s.headText, s.right]}>Lowest</Text>
          </View>
          <View style={figureCell(widths.remark)}>
            <Text style={s.headText}>Remark</Text>
          </View>
        </View>
        {rows.map((row, r) => (
          <View key={r} style={r === 0 ? [s.row, s.firstRow] : s.row} wrap={false}>
            <View style={[s.cell, s.firstCell, { width: widths.subject }]}>
              <Text style={s.bodyText}>{row.subject}</Text>
            </View>
            {row.parts.map((part, i) => (
              <View key={i} style={figureCell(WIDTH.part)}>
                <Text style={[s.bodyText, s.figure, s.right]}>{part}</Text>
              </View>
            ))}
            <View style={figureCell(WIDTH.total)}>
              <Text style={[s.bodyText, s.figure, s.right, { fontWeight: "bold" }]}>{row.total}</Text>
            </View>
            <View style={figureCell(WIDTH.grade)}>
              <Text style={[s.bodyText, s.centre, { fontWeight: "bold" }]}>{row.grade}</Text>
            </View>
            <View style={figureCell(WIDTH.position)}>
              <Text style={[s.bodyText, s.figure, s.right]}>{row.position}</Text>
            </View>
            <View style={figureCell(WIDTH.classAverage)}>
              <Text style={[s.bodyText, s.figure, s.right]}>{row.classAverage}</Text>
            </View>
            <View style={figureCell(WIDTH.highest)}>
              <Text style={[s.bodyText, s.figure, s.right]}>{row.highest}</Text>
            </View>
            <View style={figureCell(WIDTH.lowest)}>
              <Text style={[s.bodyText, s.figure, s.right]}>{row.lowest}</Text>
            </View>
            <View style={figureCell(widths.remark)}>
              <Text style={s.remarkText}>{row.remark}</Text>
            </View>
          </View>
        ))}
      </View>
      {card.gradeKey && (
        <Text style={[s.gradeKey, s.figure]}>
          <Text style={{ fontWeight: "bold" }}>Grade key: </Text>
          {card.gradeKey}
        </Text>
      )}

      <View style={s.comments}>
        <View wrap={false}>
          <Text style={s.commentHeading}>{card.teacherComment.heading}</Text>
          {card.teacherComment.text ? (
            <Text style={s.commentText}>{card.teacherComment.text}</Text>
          ) : (
            <>
              <View style={s.writeLine} />
              <View style={s.writeLine} />
            </>
          )}
          <View style={s.signedBy}>
            {card.teacherComment.formMaster && <Text>{card.teacherComment.formMaster}</Text>}
            <Text style={s.footerText}>Signature</Text>
            <View style={s.handLine} />
          </View>
        </View>
        <View wrap={false}>
          <Text style={s.commentHeading}>{card.headComment.heading}</Text>
          <Text style={s.commentText}>{card.headComment.text}</Text>
        </View>
      </View>

      <View style={s.signature} wrap={false}>
        {card.signer.signature ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; the signer's name is printed under it.
          <Image src={card.signer.signature} style={s.signatureImage} />
        ) : (
          <View style={s.signatureSpace} />
        )}
        <View style={s.signatureLine} />
        <Text style={s.signerName}>{card.signer.name}</Text>
        <Text style={s.signerTitle}>{card.signer.title}</Text>
      </View>

      <View style={s.footer} wrap={false}>
        <Text style={s.footerText}>{card.printedOn}</Text>
        {school.poweredBy && (
          <View style={s.poweredBy}>
            <Text style={s.footerText}>Powered by</Text>
            <VoxLogo />
          </View>
        )}
      </View>
    </Page>
  );
}

/** One page per card, in the order given. #15 and #21 pass a single card. */
export function ReportCardDocument({ cards, title }: { cards: ReportCardModel[]; title: string }) {
  registerCardFonts();
  return (
    <Document title={title} author={cards[0]?.school.name} creator="VoxLMS" producer="VoxLMS" language="en-NG">
      {cards.map((card, i) => (
        <Card key={i} card={card} />
      ))}
    </Document>
  );
}
