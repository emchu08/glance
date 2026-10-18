/** A real Anthropic SSE envelope, so tests exercise the SDK's streaming parser. */
export function searchStream(sources: { title: string; url: string }[], text: string, beforeText?: () => Promise<void>) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      const send = (type: string, data: object) => controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`));
      send("message_start", { message: { id: "msg_test", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } });
      send("content_block_start", { index: 0, content_block: { type: "web_search_tool_result", tool_use_id: "search_test", content: sources.map((s) => ({ ...s, type: "web_search_result", encrypted_content: "opaque", page_age: null })) } });
      send("content_block_stop", { index: 0 });
      send("content_block_start", { index: 1, content_block: { type: "text", text: "" } });
      await beforeText?.();
      // Split inside JSON strings and at arbitrary boundaries, as on the wire.
      for (let i = 0; i < text.length; i += 17) send("content_block_delta", { index: 1, delta: { type: "text_delta", text: text.slice(i, i + 17) } });
      send("content_block_stop", { index: 1 });
      send("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { input_tokens: 100, output_tokens: 80, server_tool_use: { web_search_requests: 1 } } });
      send("message_stop", {});
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}
