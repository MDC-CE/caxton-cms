/**
 * Low-priority child. Reads one perf recording and writes the thread list.
 * The web process only starts this file; it does not parse the binary.
 */
import { summarizeRecordedProfile } from "../server/cpu-profile.ts";

const [dataFile, mapCopy, liveMap, outFile, processName, timestampRaw] = process.argv.slice(2);
const timestamp = Number(timestampRaw);
if (!dataFile || !outFile || !processName || !Number.isFinite(timestamp)) {
  console.error("cpu-profile-summary: missing arguments");
  process.exit(1);
}

await summarizeRecordedProfile({
  dataFile,
  mapCopy,
  liveMap,
  outFile,
  processName,
  timestamp,
});
