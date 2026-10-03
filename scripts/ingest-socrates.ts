import fs from "fs";
import path from "path";
import {
  celestrakFetch,
  isFileMtimeNewer,
  JSON_DIR_URL,
  parseCelestrakMtime,
  shouldPollJsonDir,
  SOCRATES_BASE_URL,
} from "../lib/celestrak";
import {
  buildSnapshot,
  parseSocratesCsvStream,
  readJsonDirCheck,
  readLatestPointer,
  snapshotFileName,
  socratesPaths,
  type JsonDirEntry,
  type JsonDirCheck,
  type LatestPointer,
} from "../lib/socrates";

/**
 * Pull the latest SOCRATES screen, politely.
 *
 * - jsonDir.php at most once an hour
 * - download the CSV only when FILE_MTIME is newer than the stored pointer
 * - any non-200 throws and stops; this script does not retry
 * - if the network fails, leave the disk alone and tell the operator the API
 *   will use data/fixtures/socrates-sample.json
 */
function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value));
  fs.renameSync(tempPath, filePath);
}

function pickFile(entries: JsonDirEntry[]): JsonDirEntry {
  const preferred = entries.find((entry) => entry.FILE_NAME === "sort-minRange.csv");
  const chosen = preferred ?? entries[0];
  if (!chosen?.FILE_NAME || !chosen.FILE_MTIME) {
    throw new Error("jsonDir.php did not list a FILE_NAME and FILE_MTIME");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(chosen.FILE_NAME)) {
    throw new Error(`Refusing unexpected SOCRATES file name: ${chosen.FILE_NAME}`);
  }
  return chosen;
}

function shouldDownload(remoteMtime: string, latest: LatestPointer | null, snapshotExists: boolean): boolean {
  if (!latest || !snapshotExists) return true;
  // Stored FILE_MTIME is the usage-policy check. The pointer file's own
  // filesystem mtime is newer than the catalog time whenever we write it
  // after the run, so it is not a safe "has this file changed?" test.
  return isFileMtimeNewer(remoteMtime, latest.fileMtime);
}

async function main() {
  const paths = socratesPaths();
  if (process.env.ORBIT_WATCH_OFFLINE === "1") {
    console.log("ORBIT_WATCH_OFFLINE=1. Not contacting CelesTrak.");
    console.log(`The API will use ${paths.fixturePath}`);
    return;
  }

  const now = new Date();
  const previousCheck = readJsonDirCheck();
  const lastChecked = previousCheck ? new Date(previousCheck.checkedAt) : null;
  if (!shouldPollJsonDir(lastChecked, now)) {
    console.log("jsonDir.php was checked less than an hour ago. Not polling.");
    console.log(previousCheck?.error ? `Last check failed: ${previousCheck.error}` : "Using the snapshot already on disk, or the fixture if there is none.");
    return;
  }

  let entries: JsonDirEntry[];
  try {
    const response = await celestrakFetch(JSON_DIR_URL);
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new Error("jsonDir.php did not return a JSON array");
    }
    entries = body as JsonDirEntry[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const check: JsonDirCheck = {
      checkedAt: now.toISOString(),
      error: message,
      files: previousCheck?.files ?? [],
    };
    writeJson(paths.jsonDirCheckPath, check);
    console.error(message);
    console.error("Stopped after one attempt. No retry.");
    console.error(`The API falls back to ${paths.fixturePath}`);
    process.exitCode = 1;
    return;
  }

  writeJson(paths.jsonDirCheckPath, {
    checkedAt: now.toISOString(),
    files: entries,
  } satisfies JsonDirCheck);

  const file = pickFile(entries);
  const latest = readLatestPointer();
  const snapshotName = latest ? path.join(paths.dir, latest.snapshot) : "";
  const snapshotExists = snapshotName !== "" && fs.existsSync(snapshotName);
  console.log(`SOCRATES file ${file.FILE_NAME} FILE_MTIME ${file.FILE_MTIME} (${parseCelestrakMtime(file.FILE_MTIME).toISOString()})`);

  if (!shouldDownload(file.FILE_MTIME, latest, snapshotExists)) {
    console.log("FILE_MTIME is not newer than data/socrates/latest.json. Not downloading.");
    return;
  }

  const csvUrl = new URL(file.FILE_NAME, SOCRATES_BASE_URL).toString();
  const response = await celestrakFetch(csvUrl);
  if (!response.body) {
    throw new Error(`CelesTrak returned an empty body for ${csvUrl}. Stopping with no retries.`);
  }
  const events = await parseSocratesCsvStream(response.body);
  const snapshot = buildSnapshot(events, {
    source: "celestrak",
    fileName: file.FILE_NAME,
    fileMtime: file.FILE_MTIME,
    ingestedAt: now.toISOString(),
  });
  const fileName = snapshotFileName(file.FILE_MTIME);
  writeJson(path.join(paths.dir, fileName), snapshot);
  const pointer: LatestPointer = {
    snapshot: fileName,
    fileName: file.FILE_NAME,
    fileMtime: file.FILE_MTIME,
    ingestedAt: now.toISOString(),
    eventCount: events.length,
  };
  writeJson(paths.latestPath, pointer);
  console.log(`Wrote ${events.length} conjunctions to data/socrates/${fileName}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error("Stopped. No retry. The API falls back to data/fixtures/socrates-sample.json");
  process.exitCode = 1;
});
