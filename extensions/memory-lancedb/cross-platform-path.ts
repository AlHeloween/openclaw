import path from "node:path";

export function toPosixPath(value: string): string {
  if (path.sep === "/") {
    return value;
  }
  return value.replace(/\\/g, "/");
}

export function normalizePath(value: string): string {
  return path.normalize(value);
}

export function joinPaths(...parts: string[]): string {
  return path.join(...parts);
}

export function isWindows(): boolean {
  return path.sep === "\\";
}
