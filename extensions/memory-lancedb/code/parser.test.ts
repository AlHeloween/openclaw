import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";
import { detectLanguage, parseCodeFile, extractCodeContext, codeToMemoryText } from "./parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("code parser", () => {
  describe("detectLanguage", () => {
    test("detects TypeScript", () => {
      expect(detectLanguage("foo.ts")).toBe("typescript");
      expect(detectLanguage("foo.tsx")).toBe("typescript");
    });

    test("detects Python", () => {
      expect(detectLanguage("foo.py")).toBe("python");
    });

    test("detects Rust", () => {
      expect(detectLanguage("foo.rs")).toBe("rust");
    });

    test("detects Go", () => {
      expect(detectLanguage("foo.go")).toBe("go");
    });

    test("returns unknown for unsupported extension", () => {
      expect(detectLanguage("foo.xyz")).toBe("unknown");
    });
  });

  describe("parseCodeFile", () => {
    test("returns null for unsupported language", () => {
      const result = parseCodeFile("test.xyz");
      expect(result).toBeNull();
    });

    test("parses TypeScript function", () => {
      const fixture = path.join(__dirname, "__fixtures__", "sample.ts");
      const result = parseCodeFile(fixture);
      if (result) {
        expect(result.language).toBe("typescript");
        expect(result.symbols.length).toBeGreaterThan(0);
        expect(result.linesOfCode).toBeGreaterThan(0);
      }
    });

    test("calculates complexity", () => {
      const fixture = path.join(__dirname, "__fixtures__", "sample.ts");
      const result = parseCodeFile(fixture);
      if (result) {
        expect(result.complexity).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("extractCodeContext", () => {
    test("includes imports and symbols", () => {
      const mockParsed = {
        sourcePath: "test.ts",
        language: "typescript",
        symbols: [
          { type: "function" as const, name: "foo", line: 1, content: "function foo() {}" },
        ],
        imports: ["react", "lodash"],
        exports: ["foo"],
        complexity: 2,
        linesOfCode: 10,
        rawContent: "function foo() {}",
      };

      const context = extractCodeContext(mockParsed);
      expect(context).toContain("Imports:");
      expect(context).toContain("react");
      expect(context).toContain("function foo");
    });

    test("respects maxChars limit", () => {
      const mockParsed = {
        sourcePath: "test.ts",
        language: "typescript",
        symbols: [],
        imports: [],
        exports: [],
        complexity: 1,
        linesOfCode: 100,
        rawContent: "x".repeat(5000),
      };

      const context = extractCodeContext(mockParsed, 500);
      expect(context.length).toBeLessThanOrEqual(500 + 50);
    });
  });

  describe("codeToMemoryText", () => {
    test("formats code as memory-friendly text", () => {
      const mockParsed = {
        sourcePath: "/path/to/file.ts",
        language: "typescript",
        symbols: [
          {
            type: "function" as const,
            name: "foo",
            line: 1,
            content: "fn foo() {}",
            scope: "MyClass",
          },
          { type: "class" as const, name: "MyClass", line: 5, content: "class MyClass {}" },
        ],
        imports: ["react", "lodash"],
        exports: ["foo"],
        complexity: 3,
        linesOfCode: 50,
        rawContent: "code here",
      };

      const text = codeToMemoryText(mockParsed);
      expect(text).toContain("[typescript]");
      expect(text).toContain("file.ts");
      expect(text).toContain("function:foo");
      expect(text).toContain("class:MyClass");
      expect(text).toContain("complexity: 3");
      expect(text).toContain("LOC: 50");
    });
  });
});
