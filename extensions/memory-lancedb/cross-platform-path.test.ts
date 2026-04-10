import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { toPosixPath, isWindows, normalizePath, joinPaths } from "./cross-platform-path.js";

describe("cross-platform-path", () => {
  describe("toPosixPath", () => {
    test("returns input unchanged when no backslashes", () => {
      expect(toPosixPath("/usr/local/bin")).toBe("/usr/local/bin");
      expect(toPosixPath("file.txt")).toBe("file.txt");
      expect(toPosixPath("")).toBe("");
    });

    test("converts backslashes to forward slashes", () => {
      const result = toPosixPath("a\\b\\c");
      expect(result).toBe("a/b/c");
    });

    test("handles Windows-style paths", () => {
      const result = toPosixPath("C:\\Users\\test\\file.txt");
      expect(result).toBe("C:/Users/test/file.txt");
    });

    test("handles mixed separators", () => {
      const result = toPosixPath("a\\b/c\\d");
      expect(result).toBe("a/b/c/d");
    });

    test("handles deep paths", () => {
      const deep = "a\\b\\c\\d\\e\\f\\g\\h\\i\\j";
      expect(toPosixPath(deep)).toBe("a/b/c/d/e/f/g/h/i/j");
    });
  });

  describe("isWindows", () => {
    test("returns boolean", () => {
      expect(typeof isWindows()).toBe("boolean");
    });

    test("matches path.sep", () => {
      expect(isWindows()).toBe(path.sep === "\\");
    });
  });

  describe("normalizePath", () => {
    test("normalizes relative paths", () => {
      const result = normalizePath("a/b/../c");
      expect(result).toBe(path.normalize("a/b/../c"));
    });

    test("normalizes with double slashes", () => {
      const result = normalizePath("a//b//c");
      expect(result).toBe(path.normalize("a//b//c"));
    });
  });

  describe("joinPaths", () => {
    test("joins path segments", () => {
      const result = joinPaths("a", "b", "c");
      expect(result).toBe(path.join("a", "b", "c"));
    });

    test("handles empty segments", () => {
      const result = joinPaths("", "a", "");
      expect(result).toBe(path.join("", "a", ""));
    });

    test("handles single segment", () => {
      expect(joinPaths("a")).toBe(path.join("a"));
    });
  });
});

describe("cross-platform-path integration", () => {
  test("toPosixPath produces consistent output for path.join results", () => {
    const joined = path.join("tmp", "openclaw-state", "plugin-runtimes", "memory-lancedb");
    const posix = toPosixPath(joined);
    expect(posix).not.toContain("\\");
    expect(posix).toContain("/");
  });

  test("round-trip: join then toPosix is stable", () => {
    const parts = ["a", "b", "c", "d", "e"];
    const joined = joinPaths(...parts);
    const posix = toPosixPath(joined);
    expect(posix).toBe(
      "a/b/c/d/e".replace(/\//g, path.sep === "\\" ? "\\" : "/").replace(/\\/g, "/"),
    );
  });
});
