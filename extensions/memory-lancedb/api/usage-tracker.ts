import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

let USAGE_FILE = path.join(homedir(), ".openclaw", "memory", "usage.jsonl");

export function setUsageFilePath(filePath: string): void {
  USAGE_FILE = filePath;
}

export type UsageRecord = {
  timestamp: number;
  endpoint: string;
  method: string;
  namespace: string;
  durationMs: number;
  success: boolean;
  error?: string;
};

export function getUsageFilePath(): string {
  return USAGE_FILE;
}

function ensureUsageDir(): void {
  const dir = path.dirname(USAGE_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

const writeQueue: string[] = [];
let writePending = false;
let pendingWrite = "";

function flushWriteQueue(): void {
  if (writePending || writeQueue.length === 0) {
    return;
  }
  writePending = true;
  pendingWrite = writeQueue.splice(0, writeQueue.length).join("");
  setImmediate(() => {
    try {
      ensureUsageDir();
      fs.appendFileSync(USAGE_FILE, pendingWrite);
    } catch {
      writeQueue.unshift(pendingWrite);
    } finally {
      writePending = false;
      pendingWrite = "";
      if (writeQueue.length > 0) {
        flushWriteQueue();
      }
    }
  });
}

export function flushUsageQueue(): void {
  if (pendingWrite) {
    try {
      ensureUsageDir();
      fs.appendFileSync(USAGE_FILE, pendingWrite);
    } catch {
      // best-effort
    }
    pendingWrite = "";
    writePending = false;
  }
  ensureUsageDir();
  while (writeQueue.length > 0) {
    const lines = writeQueue.splice(0, writeQueue.length).join("");
    try {
      fs.appendFileSync(USAGE_FILE, lines);
    } catch {
      writeQueue.unshift(lines);
      break;
    }
  }
}

export function recordUsage(record: Omit<UsageRecord, "timestamp">): void {
  const fullRecord: UsageRecord = {
    ...record,
    timestamp: Date.now(),
  };
  writeQueue.push(JSON.stringify(fullRecord) + "\n");
  flushWriteQueue();
}

export function readUsageRecords(startTime?: number, endTime?: number): UsageRecord[] {
  if (!fs.existsSync(USAGE_FILE)) {
    return [];
  }
  const content = fs.readFileSync(USAGE_FILE, "utf-8").trim();
  if (!content) {
    return [];
  }
  const records: UsageRecord[] = [];
  for (const line of content.split("\n").filter(Boolean)) {
    try {
      const record = JSON.parse(line) as UsageRecord;
      if (startTime !== undefined && record.timestamp < startTime) {
        continue;
      }
      if (endTime !== undefined && record.timestamp > endTime) {
        continue;
      }
      records.push(record);
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

export function clearUsageRecords(startTime?: number, endTime?: number): number {
  if (!fs.existsSync(USAGE_FILE)) {
    return 0;
  }
  const content = fs.readFileSync(USAGE_FILE, "utf-8").trim();
  if (!content) {
    return 0;
  }
  const kept: string[] = [];
  let removed = 0;
  for (const line of content.split("\n").filter(Boolean)) {
    try {
      const record = JSON.parse(line) as UsageRecord;
      if (startTime !== undefined && record.timestamp < startTime) {
        // outside range, keep it
        kept.push(line);
      } else if (endTime !== undefined && record.timestamp > endTime) {
        // outside range, keep it
        kept.push(line);
      } else if (startTime === undefined && endTime === undefined) {
        // no range = clear all
        removed++;
      } else {
        // in range = remove
        removed++;
      }
    } catch {
      kept.push(line);
    }
  }
  if (kept.length === 0) {
    fs.unlinkSync(USAGE_FILE);
  } else {
    fs.writeFileSync(USAGE_FILE, kept.join("\n") + "\n");
  }
  return removed;
}

export function getUsageSummary(
  startTime?: number,
  endTime?: number,
): {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  byEndpoint: Record<string, { count: number; avgDurationMs: number }>;
} {
  const records = readUsageRecords(startTime, endTime);
  const byEndpoint: Record<string, { totalDuration: number; count: number; errors: number }> = {};
  let totalDuration = 0;
  let successCount = 0;
  for (const r of records) {
    if (!byEndpoint[r.endpoint]) {
      byEndpoint[r.endpoint] = { totalDuration: 0, count: 0, errors: 0 };
    }
    byEndpoint[r.endpoint].totalDuration += r.durationMs;
    byEndpoint[r.endpoint].count++;
    if (!r.success) {
      byEndpoint[r.endpoint].errors++;
    } else {
      successCount++;
    }
    totalDuration += r.durationMs;
  }
  const total = records.length;
  const errorCount = total - successCount;
  return {
    totalRequests: total,
    successCount,
    errorCount,
    avgDurationMs: total > 0 ? Math.round(totalDuration / total) : 0,
    byEndpoint: Object.fromEntries(
      Object.entries(byEndpoint).map(([ep, data]) => [
        ep,
        {
          count: data.count,
          avgDurationMs: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0,
        },
      ]),
    ),
  };
}
