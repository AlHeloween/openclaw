import fs from "node:fs";
import path from "node:path";

export interface CodeSymbol {
  type: "function" | "class" | "interface" | "const" | "import" | "export" | "type" | "enum";
  name: string;
  line: number;
  content: string;
  scope?: string;
}

export interface ParsedCode {
  sourcePath: string;
  language: string;
  symbols: CodeSymbol[];
  imports: string[];
  exports: string[];
  complexity: number;
  linesOfCode: number;
  rawContent: string;
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c-header",
  ".hpp": "cpp-header",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".sh": "bash",
  ".sql": "sql",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
};

const FUNCTION_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
    /^(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*:\s*\w+/gm,
  ],
  javascript: [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
  ],
  python: [/^(?:async\s+)?def\s+(\w+)\s*\(/gm, /^class\s+(\w+)/gm],
  rust: [
    /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/gm,
    /^(?:pub\s+)?struct\s+(\w+)/gm,
    /^(?:pub\s+)?enum\s+(\w+)/gm,
    /^(?:pub\s+)?impl\s+(?:<[^>]+>)?\s+(\w+)/gm,
  ],
  go: [/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm, /^type\s+(\w+)\s+(?:struct|interface)/gm],
  java: [
    /^(?:public|private|protected)?\s+(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\(/gm,
    /^(?:public|private|protected)?\s+class\s+(\w+)/gm,
    /^(?:public|private|protected)?\s+interface\s+(\w+)/gm,
  ],
};

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [/^import\s+.*from\s+['"]([^'"]+)['"]/gm],
  javascript: [/^import\s+.*from\s+['"]([^'"]+)['"]/gm],
  python: [/^from\s+(\S+)\s+import/gm, /^import\s+(\S+)/gm],
  rust: [/^use\s+([^;]+);/gm],
  go: [/^import\s+\(([\s\S]*?)\)/gm, /^import\s+['"]([^'"]+)['"]/gm],
  java: [/^import\s+([^;]+);/gm],
};

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_EXTENSIONS[ext] ?? "unknown";
}

export function parseCodeFile(filePath: string): ParsedCode | null {
  const ext = path.extname(filePath).toLowerCase();
  const language = LANGUAGE_EXTENSIONS[ext];

  if (!language) {
    return null;
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = rawContent.split("\n");
  const symbols: CodeSymbol[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  const funcPatterns = FUNCTION_PATTERNS[language] || [];
  const importPatterns = IMPORT_PATTERNS[language] || [];

  for (const pattern of funcPatterns) {
    let match;
    while ((match = pattern.exec(rawContent)) !== null) {
      const line = rawContent.substring(0, match.index).split("\n").length;
      const name = match[1];

      let scope = "";
      const beforeMatch = rawContent.substring(0, match.index);
      const classMatch = beforeMatch.match(/class\s+(\w+)/g);
      if (classMatch && classMatch.length > 0) {
        scope = classMatch[classMatch.length - 1].replace("class ", "");
      }

      symbols.push({
        type: name[0] === name[0].toUpperCase() ? "class" : "function",
        name,
        line,
        content: lines.slice(line - 1, Math.min(line + 5, lines.length)).join("\n"),
        scope,
      });
    }
  }

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(rawContent)) !== null) {
      const importPath = match[1]?.replace(/[()]/g, "").trim();
      if (importPath && !imports.includes(importPath)) {
        imports.push(importPath);
      }
    }
  }

  const exportMatches =
    rawContent.match(/export\s+(?:const|function|class|interface|type|enum)\s+(\w+)/g) || [];
  for (const match of exportMatches) {
    const name = match.replace(/export\s+(?:const|function|class|interface|type|enum)\s+/, "");
    exports.push(name);
  }

  const complexity = calculateComplexity(rawContent);

  return {
    sourcePath: filePath,
    language,
    symbols,
    imports,
    exports,
    complexity,
    linesOfCode: lines.length,
    rawContent,
  };
}

function calculateComplexity(content: string): number {
  let complexity = 1;
  const controlFlow = /\b(if|else|for|while|switch|case|catch|finally|try)\s*[({]/g;
  let match;
  while ((match = controlFlow.exec(content)) !== null) {
    complexity++;
  }
  const logicalOps = /\b(&&|\|\|)\b/g;
  while ((match = logicalOps.exec(content)) !== null) {
    complexity++;
  }
  return complexity;
}

export function extractCodeContext(parsed: ParsedCode, maxChars = 2000): string {
  const parts: string[] = [];

  if (parsed.imports.length > 0) {
    parts.push(`Imports: ${parsed.imports.slice(0, 10).join(", ")}`);
  }

  if (parsed.symbols.length > 0) {
    const keySymbols = parsed.symbols.slice(0, 15);
    for (const sym of keySymbols) {
      parts.push(`${sym.type} ${sym.name}${sym.scope ? ` (in ${sym.scope})` : ""}`);
    }
  }

  const header = parts.join("\n");
  const remaining = maxChars - header.length - 2;

  if (remaining <= 0) {
    return header.substring(0, maxChars);
  }

  if (parsed.rawContent.length <= remaining) {
    return header ? `${header}\n\n${parsed.rawContent}` : parsed.rawContent;
  }

  return header
    ? `${header}\n\n${parsed.rawContent.substring(0, remaining)}`
    : parsed.rawContent.substring(0, maxChars);
}

export function codeToMemoryText(parsed: ParsedCode): string {
  const symbols = parsed.symbols.map((s) => `${s.type}:${s.name}`).join(", ");
  const imports = parsed.imports.slice(0, 5).join(", ");
  return `[${parsed.language}] ${path.basename(parsed.sourcePath)} — symbols: ${symbols || "none"}; imports: ${imports || "none"}; complexity: ${parsed.complexity}; LOC: ${parsed.linesOfCode}`;
}
