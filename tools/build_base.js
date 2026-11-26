// 地図の下地（経緯線・国・国境・海岸線）を前もって SVG にしておく。
// iPhone で世界地図データを読み込んで計算すると Safari が落ちるため。
// 使い方: node tools/build_base.js  → vendor/base.js を作る（PAGES の proj を変えたら作り直す）
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..");
const d3 = require(dir + "/vendor/d3.min.js");
const topojson = require(dir + "/vendor/topojson-client.min.js");
const html = fs.readFileSync(dir + "/index.html", "utf8");
const src = html.slice(html.indexOf("const PAGES = ["), html.indexOf("const W = 1000;"));
const PAGES = new Function(src + "; return PAGES;")();
const world = JSON.parse(fs.readFileSync(dir + "/vendor/countries-50m.json"));
const o = world.objects.countries;
const features = topojson.feature(world, o).features;
const borders = topojson.mesh(world, o, (a, b) => a !== b);
const land = topojson.merge(world, o.geometries);
const W = 1000, out = {};
for (const p of PAGES) {
  const [[x0, y0], [x1, y1]] = p.proj.extent;
  const frame = { type: "MultiPoint", coordinates: [] };
  for (let i = 0; i <= 10; i++) {
    const x = x0 + (x1 - x0) * i / 10, y = y0 + (y1 - y0) * i / 10;
    frame.coordinates.push([x, y0], [x, y1], [x0, y], [x1, y]);
  }
  const proj = d3[p.proj.type]();
  if (p.proj.rotate) proj.rotate(p.proj.rotate);
  if (p.proj.parallels) proj.parallels(p.proj.parallels);
  proj.fitWidth(W, frame);
  const H = Math.round(d3.geoPath(proj).bounds(frame)[1][1]);
  proj.clipExtent([[-20, -20], [W + 20, H + 20]]).precision(0.5);
  const raw = d3.geoPath(proj).digits(1);
  // 前の点から 0.7px 未満の点は捨てる（見た目はほぼ同じで、データが軽くなる。iPhone で落ちないように）
  const pa = g => {
    const d = raw(g);
    if (!d) return d;
    return d.replace(/M[^MZ]*Z?/g, sub => {
      const closed = sub.endsWith("Z");
      const pts = sub.replace(/[MZ]/g, "").split("L").map(t => t.split(",").map(Number));
      if (pts.length < 4) return sub;
      const keep = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, y] = keep[keep.length - 1];
        if (Math.hypot(pts[i][0] - x, pts[i][1] - y) >= 0.7) keep.push(pts[i]);
      }
      keep.push(pts[pts.length - 1]);
      return "M" + keep.map(q => q.join(",")).join("L") + (closed ? "Z" : "");
    });
  };
  let svg = `<path class="grat" d="${pa(d3.geoGraticule().step([10, 10])())}"/>`;
  for (const f of features) {
    const d = pa(f);
    if (d) svg += `<path class="country" data-n="${f.properties.name}" d="${d}"/>`;
  }
  svg += `<path class="borders" d="${pa(borders)}"/><path class="coast" d="${pa(land)}"/>`;
  out[p.id] = { H, svg };
  console.log(p.id, "H", H, "chars", svg.length);
}
fs.writeFileSync(dir + "/vendor/base.js", "// tools/build_base.js で生成。手で編集しない\nwindow.MAPBASE = " + JSON.stringify(out) + ";\n");
console.log("vendor/base.js", fs.statSync(dir + "/vendor/base.js").size, "bytes");
