// Builds a filled leaf (curved band) around a quadratic centreline, width varying spine→tip.
function leaf(p0, c, p1, w0, w1, n = 48) {
  const pt = (t) => [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
  ];
  const der = (t) => [
    2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]),
    2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]),
  ];
  const a = [], b = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, [x, y] = pt(t), [dx, dy] = der(t), len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, w = (w0 + (w1 - w0) * t ** 1.2) / 2;
    a.push([x + nx * w, y + ny * w]); b.push([x - nx * w, y - ny * w]);
  }
  const f = (p) => p.map((v) => +v.toFixed(2)).join(" ");
  return "M" + [...a, ...b.reverse()].map(f).join("L") + "Z";
}
if (typeof module !== "undefined") module.exports = { leaf };
// Clip a leaf polygon to y <= base (Sutherland–Hodgman against one half-plane).
function leafOnBase(p0, c, p1, w0, w1, base, n = 64) {
  const d = leaf(p0, c, p1, w0, w1, n);
  const pts = d.slice(1, -1).split("L").map((s) => s.split(" ").map(Number));
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ain = a[1] <= base, bin = b[1] <= base;
    if (ain) out.push(a);
    if (ain !== bin) { const t = (base - a[1]) / (b[1] - a[1]); out.push([a[0] + t * (b[0] - a[0]), base]); }
  }
  return "M" + out.map((p) => p.map((v) => +v.toFixed(2)).join(" ")).join("L") + "Z";
}
if (typeof module !== "undefined") module.exports = { leaf, leafOnBase };
