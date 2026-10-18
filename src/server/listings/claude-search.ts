import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/server/env";

/**
 * Streamed web search for listings (from the original Glance lens). SERVER ONLY.
 * Listing search is retrieval and copying, not reasoning: a fast model with thinking off,
 * low effort and a single search keeps it to a few seconds.
 */
export const LISTINGS_MODEL = process.env.GLANCE_LISTINGS_MODEL ?? process.env.ANTHROPIC_LISTING_MODEL ?? "claude-haiku-5-5";
const TIMEOUT_MS = 25_000;

export type GlanceErrorCode = "not_configured" | "invalid_input" | "rate_limited" | "timeout" | "refused" | "bad_response" | "api";

export class GlanceServiceError extends Error {
  code: GlanceErrorCode;
  retryAfterMs?: number;
  constructor(code: GlanceErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "GlanceServiceError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

let client: Anthropic | null = null;
function getClient() {
  if (!env.anthropicApiKey) throw new GlanceServiceError("not_configured", "ANTHROPIC_API_KEY is not set on the server.");
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

export function toServiceError(error: unknown): GlanceServiceError {
  if (error instanceof GlanceServiceError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    const header = error.headers?.get?.("retry-after");
    const seconds = header ? Number(header) : NaN;
    return new GlanceServiceError("rate_limited", "Claude rate limit reached.", Number.isFinite(seconds) ? seconds * 1000 : undefined);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new GlanceServiceError("timeout", `Claude did not respond within ${TIMEOUT_MS / 1000}s.`);
  if (error instanceof Anthropic.APIUserAbortError) return new GlanceServiceError("timeout", "Request cancelled.");
  if (error instanceof Anthropic.AuthenticationError) return new GlanceServiceError("not_configured", "The Anthropic API key was rejected.");
  if (error instanceof Anthropic.APIError) return new GlanceServiceError("api", `Claude API error ${error.status ?? ""}: ${error.message}`.trim());
  return new GlanceServiceError("api", (error as Error)?.message ?? "Unexpected error calling Claude.");
}

/** One page the web search returned. */
export interface WebSearchSource {
  title: string;
  url: string;
  /** How old the page is, as the search reports it (e.g. "3 days ago"), when known. */
  pageAge: string | null;
}

export interface SearchStreamResult {
  /** The model's whole answer. */
  text: string;
  sources: WebSearchSource[];
  stopReason: Anthropic.StopReason | null;
  /** Billed usage: model tokens and web searches. */
  usage: { inputTokens: number; outputTokens: number; webSearches: number };
}

/** Headers must arrive within this; the whole streamed answer within the deadline. */
const SEARCH_CONNECT_TIMEOUT_MS = 15_000;
const SEARCH_DEADLINE_MS = 20_000;
/** Back-off suggested for transient failures that don't say how long to wait. */
const TRANSIENT_RETRY_MS = 1_200;

/**
 * One streamed web-search request. A single search (max_uses 1), a fast model with
 * thinking off and low effort keep it to a few seconds. `on.sources` fires as soon as the
 * search results arrive (before the model writes anything) and `on.text` with every text
 * delta, so the caller can show listings while the answer is still being written.
 *
 * Failures are GlanceServiceErrors. Transient ones (rate limits, overload, 5xx, network,
 * timeouts) carry `retryAfterMs`, which is how a caller tells it may retry.
 */
export async function streamSearchWithClaude(
  system: string,
  query: string,
  on: { sources?: (sources: WebSearchSource[]) => void; text?: (delta: string) => void } = {},
  { signal, maxTokens = 1200 }: { signal?: AbortSignal; maxTokens?: number } = {},
): Promise<SearchStreamResult> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), SEARCH_DEADLINE_MS);
  const sources: WebSearchSource[] = [];
  let text = "";
  try {
    const stream = getClient().messages.stream({
      model: LISTINGS_MODEL,
      max_tokens: maxTokens,
      system,
      output_config: { effort: "low" },
      // Haiku turns thinking off with "disabled"; Sonnet-class models with "between_tools".
      thinking: { type: LISTINGS_MODEL.includes("haiku") ? "disabled" : "between_tools" },
      messages: [{ role: "user", content: [{ type: "text", text: query }] }],
      // Haiku takes the basic web search tool version.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1,
        // These stores consistently deny server page reads. Prefer sources whose
        // product photos and prices can actually be shown on the lens.
        blocked_domains: ["walmart.com", "ebay.com", "macys.com", "kohls.com", "levi.com", "dickssportinggoods.com", "homedepot.com", "lowes.com", "nordstrom.com", "amazon.com", "amazon.ca", "amazon.co.uk", "bestbuy.com", "rei.com", "newegg.com", "camelcamelcamel.com"],
        user_location: { type: "approximate", country: "US" },
      }],
    }, { signal: signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal, timeout: SEARCH_CONNECT_TIMEOUT_MS });
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "web_search_tool_result") {
        // The whole result list arrives with the block's start.
        const content = event.content_block.content;
        if (Array.isArray(content)) {
          sources.push(...content.map((result) => ({ title: result.title, url: result.url, pageAge: result.page_age ?? null })));
          on.sources?.([...sources]);
        } else if (!sources.length) {
          // A search that failed (an error object, not a list) leaves nothing to ground listings on.
          const transient = content.error_code === "too_many_requests" || content.error_code === "unavailable";
          throw new GlanceServiceError("api", "Web search is unavailable. Check that web search is enabled in the Claude Console and retry.", transient ? TRANSIENT_RETRY_MS : undefined);
        }
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        on.text?.(event.delta.text);
      }
    }
    // Rejects with the stream's error if it ended early.
    const message = await stream.finalMessage();
    return {
      text,
      sources,
      stopReason: message.stop_reason,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        webSearches: message.usage.server_tool_use?.web_search_requests ?? 0,
      },
    };
  } catch (error) {
    if (deadline.signal.aborted && !signal?.aborted) {
      throw new GlanceServiceError("timeout", `Listing search did not finish within ${SEARCH_DEADLINE_MS / 1000}s.`, TRANSIENT_RETRY_MS);
    }
    const serviceError = toServiceError(error);
    if (serviceError.retryAfterMs === undefined && transient(error)) {
      throw new GlanceServiceError(serviceError.code, serviceError.message, TRANSIENT_RETRY_MS);
    }
    throw serviceError;
  } finally {
    clearTimeout(timer);
  }
}

/** Worth one retry: rate limits, overload and other 5xx, network failures, and errors mid-stream. */
function transient(error: unknown) {
  if (error instanceof Anthropic.APIUserAbortError) return false;
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) return true;
  if (!(error instanceof Anthropic.APIError)) return false;
  // An `error` event in the middle of a stream has no HTTP status (e.g. overloaded_error).
  if (error.status === undefined) return !["invalid_request_error", "authentication_error", "permission_error", "not_found_error"].includes(error.type ?? "");
  return error.status === 408 || error.status === 409;
}

