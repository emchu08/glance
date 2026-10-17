// Mocked Anthropic event-stream helper for offline tests of streaming parsers.
// Emits SSE-shaped events the way the Messages API streams them (no network, no credentials).
export function mockMessageStream(blocks) {
  const events = [{ type: "message_start", message: { id: "msg_mock", role: "assistant", content: [], model: "mock", usage: { input_tokens: 1, output_tokens: 0 } } }];
  blocks.forEach((b, i) => {
    events.push({ type: "content_block_start", index: i, content_block: b.type === "text" ? { type: "text", text: "" } : b });
    if (b.type === "text") for (const chunk of b.text.match(/.{1,24}/gs) ?? []) events.push({ type: "content_block_delta", index: i, delta: { type: "text_delta", text: chunk } });
    events.push({ type: "content_block_stop", index: i });
  });
  events.push({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10 } }, { type: "message_stop" });
  return new ReadableStream({ start(c) { const enc = new TextEncoder(); for (const e of events) c.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); } });
}
