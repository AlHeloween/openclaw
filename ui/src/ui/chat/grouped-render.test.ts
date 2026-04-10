/**
 * @vitest-environment jsdom
 */
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: {
    sanitize: (html: string) => html,
    addHook: vi.fn(),
  },
}));

import { renderStreamingGroup } from "./grouped-render.ts";

function renderToHtml(template: ReturnType<typeof renderStreamingGroup>): string {
  const container = document.createElement("div");
  render(template, container);
  return container.innerHTML;
}

describe("renderStreamingGroup with rich streamMessage", () => {
  const baseTime = 1_700_000_000_000;

  it("renders thinking block when streamMessage has thinking content and showThinking=true", () => {
    const msg = {
      content: [
        { type: "thinking", thinking: "Let me think about this." },
        { type: "text", text: "Here is the answer." },
      ],
    };
    const html = renderToHtml(
      renderStreamingGroup("text", baseTime, undefined, undefined, undefined, {
        streamMessage: msg,
        showThinking: true,
        showToolCalls: true,
      }),
    );
    expect(html).toContain("chat-thinking");
    expect(html).toContain("Let me think about this.");
    expect(html).toContain("Here is the answer.");
  });

  it("filters out thinking block when showThinking=false", () => {
    const msg = {
      content: [
        { type: "thinking", thinking: "Hidden thinking." },
        { type: "text", text: "Visible text." },
      ],
    };
    const html = renderToHtml(
      renderStreamingGroup("text", baseTime, undefined, undefined, undefined, {
        streamMessage: msg,
        showThinking: false,
        showToolCalls: true,
      }),
    );
    expect(html).not.toContain("Hidden thinking.");
    expect(html).toContain("Visible text.");
  });

  it("renders toolcall block with name and args preview", () => {
    const msg = {
      content: [
        {
          type: "toolcall",
          name: "read_file",
          arguments: { path: "/tmp/test.txt" },
          toolCallId: "tc-1",
        },
        { type: "text", text: "Done." },
      ],
    };
    const html = renderToHtml(
      renderStreamingGroup("text", baseTime, undefined, undefined, undefined, {
        streamMessage: msg,
        showThinking: false,
        showToolCalls: true,
      }),
    );
    expect(html).toContain("read_file");
    expect(html).toContain("chat-tool-stream");
  });

  it("renders toolresult block with result text", () => {
    const msg = {
      content: [
        { type: "toolcall", name: "bash", arguments: { command: "ls" }, toolCallId: "tc-1" },
        { type: "toolresult", name: "bash", text: "file1.txt\nfile2.txt", toolCallId: "tc-1" },
        { type: "text", text: "Listed files." },
      ],
    };
    const html = renderToHtml(
      renderStreamingGroup("text", baseTime, undefined, undefined, undefined, {
        streamMessage: msg,
        showThinking: false,
        showToolCalls: true,
      }),
    );
    expect(html).toContain("chat-tool-stream--result");
    expect(html).toContain("file1.txt");
    expect(html).toContain("Listed files.");
  });

  it("filters out toolcall and toolresult when showToolCalls=false", () => {
    const msg = {
      content: [
        { type: "toolcall", name: "bash", arguments: {}, toolCallId: "tc-1" },
        { type: "toolresult", name: "bash", text: "output", toolCallId: "tc-1" },
        { type: "text", text: "Only this shows." },
      ],
    };
    const html = renderToHtml(
      renderStreamingGroup("text", baseTime, undefined, undefined, undefined, {
        streamMessage: msg,
        showThinking: false,
        showToolCalls: false,
      }),
    );
    expect(html).not.toContain("chat-tool-stream");
    expect(html).toContain("Only this shows.");
  });

  it("falls back to plain text when streamMessage is null", () => {
    const html = renderToHtml(
      renderStreamingGroup("fallback text", baseTime, undefined, undefined, undefined, {
        streamMessage: null,
        showThinking: true,
        showToolCalls: true,
      }),
    );
    expect(html).toContain("fallback text");
    expect(html).not.toContain("chat-thinking");
    expect(html).not.toContain("chat-tool-stream");
  });

  it("falls back to plain text when streamMessage has no content array", () => {
    const html = renderToHtml(
      renderStreamingGroup("fallback", baseTime, undefined, undefined, undefined, {
        streamMessage: { role: "assistant" },
        showThinking: true,
        showToolCalls: true,
      }),
    );
    expect(html).toContain("fallback");
  });

  it("skips invalid entries in content array", () => {
    const msg = {
      content: [
        null,
        "not an object",
        { type: "text", text: "valid text" },
        { type: "unknown_type" },
      ],
    };
    const html = renderToHtml(
      renderStreamingGroup("text", baseTime, undefined, undefined, undefined, {
        streamMessage: msg,
        showThinking: false,
        showToolCalls: false,
      }),
    );
    expect(html).toContain("valid text");
  });

  it("renders all block types in correct order", () => {
    const msg = {
      content: [
        { type: "thinking", thinking: "Thinking..." },
        { type: "toolcall", name: "run", arguments: {}, toolCallId: "tc-1" },
        { type: "toolresult", name: "run", text: "result", toolCallId: "tc-1" },
        { type: "text", text: "Final answer." },
      ],
    };
    const html = renderToHtml(
      renderStreamingGroup("text", baseTime, undefined, undefined, undefined, {
        streamMessage: msg,
        showThinking: true,
        showToolCalls: true,
      }),
    );
    const thinkIdx = html.indexOf("chat-thinking");
    const toolIdx = html.indexOf("chat-tool-stream");
    const resultIdx = html.indexOf("chat-tool-stream--result");
    // Thinking appears before toolcall, toolcall before toolresult
    expect(thinkIdx).toBeLessThan(toolIdx);
    expect(toolIdx).toBeLessThan(resultIdx);
  });
});
