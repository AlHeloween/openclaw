import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordUsage,
  readUsageRecords,
  clearUsageRecords,
  getUsageSummary,
  getUsageFilePath,
  setUsageFilePath,
  flushUsageQueue,
  type UsageRecord,
} from "./usage-tracker.js";

describe("usage-tracker", () => {
  let tmpDir: string;
  let usageFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-usage-test-"));
    usageFile = path.join(tmpDir, "usage.jsonl");
    setUsageFilePath(usageFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("recordUsage", () => {
    test("appends a record to the JSONL file", () => {
      recordUsage({
        endpoint: "/api/v1/embeddings",
        method: "POST",
        namespace: "global",
        durationMs: 42,
        success: true,
      });
      flushUsageQueue();

      const content = fs.readFileSync(usageFile, "utf-8");
      const record = JSON.parse(content.trim()) as UsageRecord;
      expect(record.endpoint).toBe("/api/v1/embeddings");
      expect(record.method).toBe("POST");
      expect(record.namespace).toBe("global");
      expect(record.durationMs).toBe(42);
      expect(record.success).toBe(true);
      expect(record.timestamp).toBeDefined();
    });

    test("records error message on failure", () => {
      recordUsage({
        endpoint: "/api/v1/search",
        method: "POST",
        namespace: "test",
        durationMs: 100,
        success: false,
        error: "Connection refused",
      });
      flushUsageQueue();

      const content = fs.readFileSync(usageFile, "utf-8");
      const record = JSON.parse(content.trim()) as UsageRecord;
      expect(record.success).toBe(false);
      expect(record.error).toBe("Connection refused");
    });

    test("creates directory if missing", () => {
      recordUsage({
        endpoint: "/api/v1/models",
        method: "GET",
        namespace: "global",
        durationMs: 5,
        success: true,
      });
      flushUsageQueue();
      expect(fs.existsSync(usageFile)).toBe(true);
    });
  });

  describe("readUsageRecords", () => {
    test("returns empty array if no file exists", () => {
      expect(readUsageRecords()).toEqual([]);
    });

    test("reads all records when no time filter", () => {
      recordUsage({
        endpoint: "/api/v1/a",
        method: "GET",
        namespace: "global",
        durationMs: 10,
        success: true,
      });
      recordUsage({
        endpoint: "/api/v1/b",
        method: "POST",
        namespace: "global",
        durationMs: 20,
        success: true,
      });
      flushUsageQueue();

      const records = readUsageRecords();
      expect(records).toHaveLength(2);
      expect(records[0].endpoint).toBe("/api/v1/a");
      expect(records[1].endpoint).toBe("/api/v1/b");
    });

    test("filters by time range", () => {
      recordUsage({
        endpoint: "/api/v1/a",
        method: "GET",
        namespace: "global",
        durationMs: 10,
        success: true,
      });
      flushUsageQueue();
      const now = Date.now();
      const records = readUsageRecords(now - 1000, now + 1000);
      expect(records).toHaveLength(1);
    });

    test("skips malformed lines", () => {
      fs.mkdirSync(path.dirname(usageFile), { recursive: true });
      fs.writeFileSync(usageFile, 'not json\n{"endpoint":"/ok"}\n');
      const records = readUsageRecords();
      expect(records).toHaveLength(1);
      expect(records[0].endpoint).toBe("/ok");
    });
  });

  describe("clearUsageRecords", () => {
    test("clears all records when no time range", () => {
      recordUsage({
        endpoint: "/api/v1/a",
        method: "GET",
        namespace: "global",
        durationMs: 10,
        success: true,
      });
      recordUsage({
        endpoint: "/api/v1/b",
        method: "POST",
        namespace: "global",
        durationMs: 20,
        success: true,
      });
      flushUsageQueue();

      const removed = clearUsageRecords();
      expect(removed).toBe(2);
      expect(fs.existsSync(usageFile)).toBe(false);
    });

    test("clears only records in time range", () => {
      recordUsage({
        endpoint: "/api/v1/a",
        method: "GET",
        namespace: "global",
        durationMs: 10,
        success: true,
      });
      flushUsageQueue();
      const now = Date.now();
      const removed = clearUsageRecords(now - 1000, now + 1000);
      expect(removed).toBe(1);
    });

    test("returns 0 if no file exists", () => {
      expect(clearUsageRecords()).toBe(0);
    });
  });

  describe("getUsageSummary", () => {
    test("returns empty summary when no records", () => {
      const summary = getUsageSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.successCount).toBe(0);
      expect(summary.errorCount).toBe(0);
      expect(summary.avgDurationMs).toBe(0);
      expect(summary.byEndpoint).toEqual({});
    });

    test("aggregates stats correctly", () => {
      recordUsage({
        endpoint: "/api/v1/embeddings",
        method: "POST",
        namespace: "global",
        durationMs: 100,
        success: true,
      });
      recordUsage({
        endpoint: "/api/v1/embeddings",
        method: "POST",
        namespace: "global",
        durationMs: 200,
        success: true,
      });
      recordUsage({
        endpoint: "/api/v1/search",
        method: "POST",
        namespace: "global",
        durationMs: 50,
        success: false,
        error: "timeout",
      });
      flushUsageQueue();

      const summary = getUsageSummary();
      expect(summary.totalRequests).toBe(3);
      expect(summary.successCount).toBe(2);
      expect(summary.errorCount).toBe(1);
      expect(summary.avgDurationMs).toBe(117);
      expect(summary.byEndpoint["/api/v1/embeddings"]).toEqual({ count: 2, avgDurationMs: 150 });
      expect(summary.byEndpoint["/api/v1/search"]).toEqual({ count: 1, avgDurationMs: 50 });
    });

    test("filters by time range", () => {
      recordUsage({
        endpoint: "/api/v1/a",
        method: "GET",
        namespace: "global",
        durationMs: 10,
        success: true,
      });
      flushUsageQueue();
      const now = Date.now();
      const summary = getUsageSummary(now - 1000, now + 1000);
      expect(summary.totalRequests).toBe(1);
    });
  });

  describe("getUsageFilePath", () => {
    test("returns the configured path", () => {
      expect(getUsageFilePath()).toBe(usageFile);
    });
  });
});
