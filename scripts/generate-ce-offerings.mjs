/**
 * Build site_learning-mdc-edu/data/ce-offerings.json from a pg_restore SQL script
 * of course, section, program_stream, program_area, and course_program_stream.
 *
 *   pg_restore --data-only -t section -t course -t program_stream -t program_area -t course_program_stream -f catalog.sql DUMP
 *   node scripts/generate-ce-offerings.mjs catalog.sql
 *
 * Keeps sections that still accept enrollment and have not ended.
 * Does not copy fees, descriptions, or staff ids.
 */
import fs from "node:fs";

const sqlPath = process.argv[2];
const outPath = process.argv[3] || "site_learning-mdc-edu/data/ce-offerings.json";
if (!sqlPath) {
  console.error("Usage: node scripts/generate-ce-offerings.mjs catalog.sql [out.json]");
  process.exit(1);
}

const TODAY = "2026-10-19";

const THEME_IMAGES = {
  health: ["ce-topic-nursing", "ce-patient-care", "ce-tile-vitals"],
  language: ["ce-topic-language", "ce-camino"],
  business: ["ce-topic-business"],
  childcare: ["ce-childcare-classroom"],
  youth: ["ce-topic-youth", "ce-childcare-classroom"],
  tech: ["ce-tech-server", "ce-tile-network"],
  trades: ["ce-tile-framing", "ce-jobsite-crew", "ce-hvac"],
  electrical: ["ce-comptia"],
  auto: ["ce-engine-technician"],
  culinary: ["ce-culinary-class", "ce-culinary-skills", "ce-culinary-kitchen", "ce-tile-plating", "ce-pastry-prep", "ce-bakery-owners"],
  fitness: ["ce-topic-fitness"],
  enrichment: ["ce-topic-enrichment"],
  exam: ["ce-sit-exam"],
  credential: ["ce-hero-credential", "ce-sit-exam"],
  aviation: ["ce-topic-aviation"],
};

// AI classes use the laptop-classroom photo. The tech pool is a server room and a network switch.
const TITLE_THEMES = [
  [/artificial intelligence|chatgpt|\bcopilot\b|machine learning/i, "business"],
  [/aviation|aircraft|\bpilot\b|airframe/i, "aviation"],
  [/nurs|\bcna\b|phlebot|patient care|dental|clinic|emt|pharm/i, "health"],
  [/hvac|plumb|weld|framing|carpenter|mason/i, "trades"],
  [/electric|wiring/i, "electrical"],
  [/\bauto\b|\bengines?\b|mechanic/i, "auto"],
  [/culin|pastry|bakery|\bchef\b|\bcooks?\b|\bcooking\b/i, "culinary"],
  [/yoga|fitness|pilates|zumba|ballet|dance|\bsports?\b|martial|judo|karate/i, "fitness"],
  [/child ?care|preschool|infant|toddler/i, "childcare"],
  [/microsoft office|\bpowerpoint\b|\boutlook\b|\bquickbooks\b/i, "business"],
  [/spanish|esol|\besl\b|english|language|conversation|french|german|italian|portuguese|creole/i, "language"],
  [/contabil|negocio|marketing|\bexcel\b|administraci|finanza|emprend/i, "business"],
  [/comput|programaci|\bredes\b/i, "tech"],
];

function unescapeCopy(value) {
  if (value === "\\N") return null;
  return value.replace(/\\(n|r|t|b|f|\\)/g, (_, token) => {
    if (token === "n") return "\n";
    if (token === "r") return "\r";
    if (token === "t") return "\t";
    if (token === "b") return "\b";
    if (token === "f") return "\f";
    return "\\";
  });
}

function parseCopyBlocks(sql) {
  const blocks = new Map();
  const lines = sql.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const header = /^COPY public\.(\w+) \((.+)\) FROM stdin;$/.exec(line);
    if (header) {
      current = { name: header[1], columns: header[2].split(", ").map((column) => column.trim()), rows: [] };
      blocks.set(current.name, current);
      continue;
    }
    if (!current) continue;
    if (line === "\\.") {
      current = null;
      continue;
    }
    const values = line.split("\t").map(unescapeCopy);
    const row = {};
    current.columns.forEach((column, index) => {
      row[column] = values[index] ?? null;
    });
    current.rows.push(row);
  }
  return blocks;
}

function bool(value) {
  return value === "t" || value === "true";
}

function campusName(value) {
  if (!value) return "";
  return value.replace(/\s+Campus$/i, "").replace(/^MDC\s+/i, "").trim();
}

function formatLabel(value) {
  if (!value) return undefined;
  const first = value.split(",")[0].trim();
  if (!first || first === "Language not found") return undefined;
  return first.replace(/^MDC\s+/i, "").replace(/In-Person/i, "In person");
}

function durationLabel(hours) {
  if (hours == null || hours === "") return undefined;
  const amount = Number(hours);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const shown = Number.isInteger(amount) ? String(amount) : String(amount);
  return `${shown} hours`;
}

function hash(text) {
  let total = 0;
  for (let index = 0; index < text.length; index += 1) total = (total + text.charCodeAt(index) * (index + 1)) % 997;
  return total;
}

function themeFor(areaName, title) {
  for (const [pattern, theme] of TITLE_THEMES) {
    if (pattern.test(title)) return theme;
  }
  const area = (areaName || "").toLowerCase();
  if (area.includes("health")) return "health";
  if (area.includes("english") || area.includes("language") || area.includes("español")) return "language";
  if (area.includes("business")) return "business";
  if (area.includes("child")) return "childcare";
  if (area.includes("technolog")) return "tech";
  if (area.includes("fitness") || area.includes("sport")) return "fitness";
  if (area.includes("kid") || area.includes("teen") || area.includes("summer") || area.includes("camp")) return "youth";
  if (area.includes("construction") || area.includes("trade")) return "trades";
  if (area.includes("aviation")) return "aviation";
  if (area.includes("test")) return "exam";
  if (area.includes("certification") || area.includes("licens")) return "credential";
  if (area.includes("parent")) return "childcare";
  if (area.includes("enrich")) return "enrichment";
  return "credential";
}

function imageFor(areaName, title) {
  const theme = themeFor(areaName, title);
  const pool = THEME_IMAGES[theme] || THEME_IMAGES.credential;
  return pool[hash(`${theme}:${title}`) % pool.length];
}

if (sqlPath === "--remap") {
  const file = process.argv[3] || "site_learning-mdc-edu/data/ce-offerings.json";
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const row of payload.offerings) {
    row.image_id = imageFor(row.program_area_name, row.course_title);
  }
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  const counts = {};
  for (const row of payload.offerings) counts[row.image_id] = (counts[row.image_id] || 0) + 1;
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}

function isTestCourse(course) {
  if (!course) return true;
  if (bool(course.is_manual)) return true;
  if (String(course.destiny_code || "").startsWith("ME-")) return true;
  return /\btest\b/i.test(course.title || "");
}

const blocks = parseCopyBlocks(fs.readFileSync(sqlPath, "utf8"));
const courses = new Map((blocks.get("course")?.rows || []).map((row) => [row.id, row]));
const streams = new Map((blocks.get("program_stream")?.rows || []).map((row) => [row.id, row]));
const areas = new Map((blocks.get("program_area")?.rows || []).map((row) => [row.id, row]));
const streamByCourse = new Map();
for (const link of blocks.get("course_program_stream")?.rows || []) {
  if (!streamByCourse.has(link.course_id)) streamByCourse.set(link.course_id, link.program_stream_id);
}

const offerings = [];
let skipped = 0;
for (const section of blocks.get("section")?.rows || []) {
  if (!bool(section.is_available)) {
    skipped += 1;
    continue;
  }
  const start = section.start_date;
  const end = section.end_date;
  const stillOpen = (start && start >= TODAY) || (end && end >= TODAY);
  if (!stillOpen) {
    skipped += 1;
    continue;
  }
  const course = courses.get(section.course_id);
  if (!course || !bool(course.is_active) || isTestCourse(course)) {
    skipped += 1;
    continue;
  }
  const streamId = course.program_stream_id || streamByCourse.get(course.id);
  const stream = streamId ? streams.get(streamId) : null;
  const area = stream?.program_area_id ? areas.get(stream.program_area_id) : null;
  const rawArea = area?.name?.trim();
  const areaName = rawArea && !/page not found/i.test(rawArea)
    ? rawArea
    : (stream?.name?.trim() || "Continuing Education");
  const title = (course.title || section.section_title || "").trim();
  const courseUrl = (course.source_url && course.source_url.startsWith("http") && course.source_url)
    || (section.source_url && section.source_url.startsWith("http") && section.source_url)
    || (course.destiny_code
      ? `https://ce.mdc.edu/search/publicCourseSearchDetails.do?method=load&courseId=${course.destiny_code}`
      : "");
  if (!title || !start || !courseUrl) {
    skipped += 1;
    continue;
  }
  const campus = campusName(section.campus) || campusName(course.campus);
  offerings.push({
    start_date: start,
    course_title: title,
    course_url: courseUrl,
    campus: campus || "Campus",
    program_area_name: areaName,
    is_available: true,
    duration: durationLabel(section.contact_hours),
    format: formatLabel(section.delivery_options) || formatLabel(course.delivery_options) || formatLabel(section.language_of_delivery),
    image_id: imageFor(areaName, title),
    image_alt: title,
  });
}

offerings.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.course_title.localeCompare(b.course_title));

const payload = {
  source: "Selective export from the anonymized Continuing Education dump. Sections that are closed or already ended are omitted. Photos are gallery ids chosen from the program area, not from the database.",
  generated_on: TODAY,
  offerings,
};

fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
const areasSeen = new Set(offerings.map((row) => row.program_area_name));
const campuses = new Set(offerings.map((row) => row.campus));
console.log(JSON.stringify({
  offerings: offerings.length,
  skipped,
  areas: areasSeen.size,
  campuses: campuses.size,
  first: offerings[0]?.start_date,
  last: offerings.at(-1)?.start_date,
}, null, 2));
