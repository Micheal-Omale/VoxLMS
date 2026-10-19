import "server-only";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { CARD_FONT, registerCardFonts } from "@/components/report-card/fonts";
import { type PinSlip, SLIP_WARNING, SLIPS_PER_PAGE } from "@/lib/result-pin";

// Result PIN slips (spec 0014, AC-8): A4 portrait, 2 columns by 5 rows of
// 105 by 59.4 mm, dashed 0.5 point cut lines, text kept 7 mm inside every
// edge. Black only, nothing under 7.5 point. Every string comes ready made.

const INK = "#000000";

const styles = StyleSheet.create({
  page: { fontFamily: CARD_FONT, color: INK, flexDirection: "row", flexWrap: "wrap" },
  slip: { width: "105mm", height: "59.4mm", padding: "7mm", borderColor: INK, borderStyle: "dashed" },
  school: { fontSize: 9, fontWeight: "bold", lineHeight: 1.2, maxLines: 2, textOverflow: "ellipsis" },
  heading: { fontSize: 8, marginTop: 2, maxLines: 1, textOverflow: "ellipsis" },
  student: { fontSize: 9, lineHeight: 1.2, marginTop: 3, maxLines: 2, textOverflow: "ellipsis" },
  pin: { fontSize: 18, fontWeight: "bold", fontFeatureSettings: ["tnum"], letterSpacing: 1, marginTop: 3 },
  small: { fontSize: 7.5, marginTop: 1.5 },
  oneLine: { maxLines: 1, textOverflow: "ellipsis" },
});

function Slip({ slip, index }: { slip: PinSlip; index: number }) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return (
    <View style={[styles.slip, { borderRightWidth: column === 0 ? 0.5 : 0, borderBottomWidth: row < 4 ? 0.5 : 0 }]} wrap={false}>
      <Text style={styles.school}>
        {slip.school}
      </Text>
      <Text style={styles.heading}>
        {slip.heading}
      </Text>
      <Text style={styles.student}>
        {slip.student}
      </Text>
      <Text style={styles.pin}>{slip.pin}</Text>
      <Text style={styles.small}>{slip.serial}</Text>
      <Text style={[styles.small, styles.oneLine]}>
        {slip.checkAt}
      </Text>
      <Text style={styles.small}>{SLIP_WARNING}</Text>
    </View>
  );
}

export function PinSlipsDocument({ slips, title }: { slips: PinSlip[]; title: string }) {
  registerCardFonts();
  const pages: PinSlip[][] = [];
  for (let i = 0; i < slips.length; i += SLIPS_PER_PAGE) pages.push(slips.slice(i, i + SLIPS_PER_PAGE));
  return (
    <Document title={title} author="VoxLMS" creator="VoxLMS" producer="VoxLMS">
      {pages.map((page, p) => (
        <Page key={p} size="A4" style={styles.page} wrap={false}>
          {page.map((slip, i) => (
            <Slip key={i} slip={slip} index={i} />
          ))}
        </Page>
      ))}
    </Document>
  );
}
