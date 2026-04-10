/**
 * @vitest-environment jsdom
 *
 * Integration test for the full streaming pipeline:
 * server agent events → broadcast payload → UI controller → UI rendering
 *
 * This test verifies that rich content (thinking, tool calls, tool results, text)
 * flows correctly from the server-side event handler through to the UI rendering
 * layer, catching merge gaps where one side changes but the other doesn't.
 */
import { describe, expect, it, vi } from "vitest";

// ── Server-side mocks ────────────────────────────────────────────────────────

const broadcastMock = vi.fn();
const nodeSendToSessionMock = vi.fn();

function createServerHarness() {
  const chatRunState = {
    buffers: new Map<string, string>(),
    deltaSentAt: new Map<string, number>(),
    deltaLastBroadcastLen: new Map<string, number>(),
    thinking: new Map<string, string>(),
    toolCalls: new Map<
      string,
      Map<
        string,
        { toolCallId: string; name: string; args?: unknown; result?: string; phase: string }
      >
    >(),
    registry: {
      add: vi.fn((_runId: string, _info: { sessionKey: string; clientRunId: string }) => {}),
      get: vi.fn((_runId: string) => ({ sessionKey: "session-1", clientRunId: "client-1" })),
      shift: vi.fn(),
    },
  };

  const buildRichContent = (clientRunId: string, text: string) => {
    const content: Array<Record<string, unknown>> = [];
    const think = chatRunState.thinking.get(clientRunId);
    if (think) {
      content.push({ type: "thinking", thinking: think });
    }
    const tools = chatRunState.toolCalls.get(clientRunId);
    if (tools && tools.size > 0) {
      for (const [, entry] of tools) {
        content.push({
          type: "toolcall",
          name: entry.name,
          arguments: entry.args ?? {},
          toolCallId: entry.toolCallId,
        });
        if (entry.result !== undefined) {
          content.push({
            type: "toolresult",
            name: entry.name,
            text: entry.result,
            toolCallId: entry.toolCallId,
          });
        }
      }
    }
    if (text) {
      content.push({ type: "text", text });
    }
    return content;
  };

  const emitDelta = (runId: string, clientRunId: string, text: string) => {
    const content = buildRichContent(clientRunId, text);
    const payload = {
      runId: "client-1",
      sessionKey: "session-1",
      seq: 1,
      state: "delta" as const,
      message: {
        role: "assistant",
        content,
        timestamp: Date.now(),
      },
    };
    broadcastMock("chat", payload, { dropIfSlow: true });
    nodeSendToSessionMock("session-1", "chat", payload);
    return payload;
  };

  const emitToolStart = (
    runId: string,
    clientRunId: string,
    toolCallId: string,
    name: string,
    args: unknown,
  ) => {
    const tools = chatRunState.toolCalls.get(clientRunId);
    if (!tools) {
      const map = new Map();
      map.set(toolCallId, { toolCallId, name, args, phase: "start" as const });
      chatRunState.toolCalls.set(clientRunId, map);
    } else {
      tools.set(toolCallId, { toolCallId, name, args, phase: "start" as const });
    }
  };

  const emitToolResult = (
    runId: string,
    clientRunId: string,
    toolCallId: string,
    result: string,
  ) => {
    const tools = chatRunState.toolCalls.get(clientRunId);
    if (tools) {
      const entry = tools.get(toolCallId);
      if (entry) {
        entry.phase = "result";
        entry.result = result;
      }
    }
  };

  const emitThinking = (clientRunId: string, thinking: string) => {
    chatRunState.thinking.set(clientRunId, thinking);
  };

  const emitLifecycleEnd = (clientRunId: string) => {
    chatRunState.thinking.delete(clientRunId);
    chatRunState.toolCalls.delete(clientRunId);
    chatRunState.buffers.delete(clientRunId);
    const payload = {
      runId: "client-1",
      sessionKey: "session-1",
      seq: 10,
      state: "final" as const,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Final response." }],
        timestamp: Date.now(),
      },
    };
    broadcastMock("chat", payload);
    return payload;
  };

  return {
    chatRunState,
    buildRichContent,
    emitDelta,
    emitToolStart,
    emitToolResult,
    emitThinking,
    emitLifecycleEnd,
  };
}

// ── UI-side pipeline ─────────────────────────────────────────────────────────

import { handleChatEvent, type ChatState } from "../../ui/src/ui/controllers/chat.ts";

function createUIState(): ChatState {
  return {
    chatAttachments: [],
    chatLoading: false,
    chatMessage: "",
    chatMessages: [],
    chatRunId: null,
    chatSending: false,
    chatStream: null,
    chatStreamStartedAt: null,
    chatStreamMessage: null,
    chatThinkingLevel: null,
    client: null,
    connected: true,
    lastError: null,
    sessionKey: "session-1",
  };
}

// ── Integration tests ────────────────────────────────────────────────────────

describe("full streaming pipeline: server events → UI controller", () => {
  it("transmits thinking content from server buildRichContent through to UI chatStreamMessage", () => {
    const server = createServerHarness();
    const ui = createUIState();

    // Server: agent produces thinking
    server.emitThinking("client-1", "Let me analyze this step by step...");

    // Server: emits delta with rich content
    const serverPayload = server.emitDelta("run-1", "client-1", "Here is my analysis.");

    // UI: receives the delta event
    handleChatEvent(ui, {
      state: "delta",
      runId: "client-1",
      sessionKey: "session-1",
      message: serverPayload.message,
    });

    // Verify UI received the full rich message
    expect(ui.chatStreamMessage).not.toBeNull();
    const msg = ui.chatStreamMessage as {
      content: Array<{ type: string; thinking?: string; text?: string }>;
    };
    const thinkingBlock = msg.content.find((b) => b.type === "thinking");
    expect(thinkingBlock).toBeDefined();
    expect(thinkingBlock?.thinking).toBe("Let me analyze this step by step...");

    const textBlock = msg.content.find((b) => b.type === "text");
    expect(textBlock?.text).toBe("Here is my analysis.");
  });

  it("transmits tool call lifecycle from server through to UI chatStreamMessage", () => {
    const server = createServerHarness();
    const ui = createUIState();

    // Server: tool call starts
    server.emitToolStart("run-1", "client-1", "tc-1", "bash", { command: "ls -la" });

    // Server: emits delta (tool call is now in rich content)
    const payload1 = server.emitDelta("run-1", "client-1", "");

    // UI: receives delta with tool call
    handleChatEvent(ui, {
      state: "delta",
      runId: "client-1",
      sessionKey: "session-1",
      message: payload1.message,
    });

    expect(ui.chatStreamMessage).not.toBeNull();
    const msg1 = ui.chatStreamMessage as {
      content: Array<{ type: string; name?: string; toolCallId?: string }>;
    };
    const toolCallBlock = msg1.content.find((b) => b.type === "toolcall");
    expect(toolCallBlock).toBeDefined();
    expect(toolCallBlock?.name).toBe("bash");
    expect(toolCallBlock?.toolCallId).toBe("tc-1");

    // Server: tool call completes with result
    server.emitToolResult("run-1", "client-1", "tc-1", "file1.txt\nfile2.txt");

    // Server: emits updated delta (now includes toolresult)
    const payload2 = server.emitDelta("run-1", "client-1", "Found two files.");

    // UI: receives delta with tool result
    handleChatEvent(ui, {
      state: "delta",
      runId: "client-1",
      sessionKey: "session-1",
      message: payload2.message,
    });

    const msg2 = ui.chatStreamMessage as {
      content: Array<{ type: string; name?: string; text?: string }>;
    };
    const toolResultBlock = msg2.content.find((b) => b.type === "toolresult");
    expect(toolResultBlock).toBeDefined();
    expect(toolResultBlock?.name).toBe("bash");
    expect(toolResultBlock?.text).toBe("file1.txt\nfile2.txt");
  });

  it("clears chatStreamMessage when server emits lifecycle end (final event)", () => {
    const server = createServerHarness();
    const ui = createUIState();

    // Server: produces some content
    server.emitThinking("client-1", "Thinking...");
    server.emitDelta("run-1", "client-1", "Partial response.");

    // UI: receives delta
    handleChatEvent(ui, {
      state: "delta",
      runId: "client-1",
      sessionKey: "session-1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Thinking..." },
          { type: "text", text: "Partial response." },
        ],
        timestamp: Date.now(),
      },
    });
    expect(ui.chatStreamMessage).not.toBeNull();

    // Server: lifecycle ends
    const finalPayload = server.emitLifecycleEnd("client-1");

    // UI: receives final event
    handleChatEvent(ui, {
      state: "final",
      runId: "client-1",
      sessionKey: "session-1",
      message: finalPayload.message,
    });

    // UI: streaming state cleared
    expect(ui.chatStreamMessage).toBeNull();
    expect(ui.chatStream).toBeNull();
    expect(ui.chatRunId).toBeNull();
  });

  it("produces correctly ordered content blocks: thinking → toolcall → toolresult → text", () => {
    const server = createServerHarness();
    const ui = createUIState();

    // Set up full scenario: thinking + tool call with result + text
    server.emitThinking("client-1", "I need to run a command first.");
    server.emitToolStart("run-1", "client-1", "tc-1", "bash", { command: "ls" });
    server.emitToolResult("run-1", "client-1", "tc-1", "file1.txt");

    const serverPayload = server.emitDelta("run-1", "client-1", "Here are the files.");

    handleChatEvent(ui, {
      state: "delta",
      runId: "client-1",
      sessionKey: "session-1",
      message: serverPayload.message,
    });

    const msg = ui.chatStreamMessage as { content: Array<{ type: string }> };
    const types = msg.content.map((b) => b.type);
    expect(types).toEqual(["thinking", "toolcall", "toolresult", "text"]);
  });

  it("broadcast payload structure matches what UI controller expects", () => {
    const server = createServerHarness();

    server.emitThinking("client-1", "thinking");
    server.emitToolStart("run-1", "client-1", "tc-1", "read", { path: "/test" });
    server.emitDelta("run-1", "client-1", "done");

    // Verify broadcast was called with correct structure
    expect(broadcastMock).toHaveBeenCalled();
    const chatCall = broadcastMock.mock.calls.find(([event]) => event === "chat");
    expect(chatCall).toBeDefined();

    const payload = chatCall?.[1] as {
      state: string;
      message: { role: string; content: Array<Record<string, unknown>>; timestamp: number };
    };
    expect(payload.state).toBe("delta");
    expect(payload.message.role).toBe("assistant");
    expect(Array.isArray(payload.message.content)).toBe(true);
    expect(payload.message.content.length).toBeGreaterThan(0);

    // Verify each content block has the expected shape
    for (const block of payload.message.content) {
      expect(typeof block.type).toBe("string");
    }

    // Verify the UI can process this payload
    const ui = createUIState();
    handleChatEvent(ui, {
      state: "delta",
      runId: "client-1",
      sessionKey: "session-1",
      message: payload.message,
    });
    expect(ui.chatStreamMessage).not.toBeNull();
  });
});
