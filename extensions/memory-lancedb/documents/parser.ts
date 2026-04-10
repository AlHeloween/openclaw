import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

export interface DocumentPage {
  pageNumber: number;
  text: string;
  numpages: number;
  info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  version: string;
}

export interface ParsedDocument {
  pages: DocumentPage[];
  totalPages: number;
  title?: string;
  author?: string;
  subject?: string;
  sourcePath: string;
  type: "pdf" | "djvu";
}

export async function parsePDF(filePath: string): Promise<ParsedDocument> {
  const data = fs.readFileSync(filePath);

  PDFParse.setWorker();

  const parser = new PDFParse({ data });
  const info = await parser.getInfo();
  const textResult = await parser.getText();
  const text = textResult.text;
  await parser.destroy();

  const chunkSize = 2000;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  const pages: DocumentPage[] = chunks.map((chunk, idx) => ({
    pageNumber: idx + 1,
    text: chunk,
    numpages: chunks.length,
    info: info.info ? { ...info.info } : undefined,
    metadata: info.metadata ? { ...info.metadata } : undefined,
    version: "2.0",
  }));

  return {
    pages,
    totalPages: pages.length,
    title: info.info?.Title as string | undefined,
    author: info.info?.Author as string | undefined,
    subject: info.info?.Subject as string | undefined,
    sourcePath: filePath,
    type: "pdf",
  };
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    return parsePDF(filePath);
  }
  if (ext === ".djvu") {
    throw new Error(
      "DJVU parsing requires djvujs (not available on npm). Clone from https://github.com/RussCoder/djvujs and add to dependencies.",
    );
  }
  throw new Error(`Unsupported document format: ${ext}`);
}

export function extractDocumentText(doc: ParsedDocument): string {
  return doc.pages.map((p) => p.text).join("\n\n");
}

export function splitIntoChunks(text: string, maxChars = 1500, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    let chunkEnd = end;
    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end);
      const lastPeriod = text.lastIndexOf(". ", end);
      chunkEnd = Math.max(lastNewline, lastPeriod, start + maxChars / 2);
      if (chunkEnd > start + maxChars) {
        chunkEnd = end;
      }
    }
    chunks.push(text.slice(start, chunkEnd).trim());
    start = chunkEnd - overlap;
    if (start <= 0) {
      start = chunkEnd;
    }
  }
  return chunks.filter((c) => c.length > 10);
}
