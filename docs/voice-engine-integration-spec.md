# Voice Engine Integration Spec
**Sarvam (primary) → OpenAI `gpt-realtime-mini` (fallback) → Plivo (telephony, later) + Redis caching**
Grounded directly in the current code at `~/Desktop/RigaChat` (read 3 Sep 2026). Every file path, interface, and env var below is what's actually there today, not a guess.

This is the implementation spec for the decision you just made: keep the browser-widget voice agent you already ship, swap its engine from hardcoded OpenAI to Sarvam-first-with-OpenAI-fallback, and add a Redis cache in front of both. Telephony (Plivo) is scoped as Phase 2 below, on top of the same engine seam — building the seam correctly now is what makes Plivo a transport add, not a rewrite, next.

---

## 0. What exists today (verified by reading the code)

- `backend/src/providers/voice-provider.ts` — a `VoiceProvider` interface (`connect`, `disconnect`, `sendAudio`, `onAudioResponse`, `onTranscript`, `isConnected`). **Nothing implements it.** It's dead code.
- `backend/src/voice-relay/session.ts` — the actual live implementation. `VoiceSession` hardcodes a WebSocket to `wss://api.openai.com/v1/realtime?model=gpt-realtime`, sends `session.update` with `audio/pcm @ 24000`, handles `response.output_audio.delta`, `input_audio_buffer.speech_started` (barge-in), and a `search_knowledge_base` function-call tool wired to `POST {BACKEND_URL}/api/voice-agents/rag`. It writes `VoiceCallLog` (tokens, duration) via `writeVoiceCallLog()`.
- `backend/src/voice-relay/server.ts` — a bare Node `http` + `ws` server on port 3100, looks up the `VoiceAgent` record from DynamoDB by `agentId`, HMAC-token-auths the browser connection (`auth.ts`), and constructs one `VoiceSession` per browser WebSocket.
- `backend/src/services/voice-service.ts` + `backend/src/repositories/voice-repository.ts` — full CRUD for `VoiceAgent` records, KB entries, usage summaries. This is unaffected by an engine swap; it's the config/CRM side, not the media path.
- `backend/src/providers/redis/` — **a working caching backbone already exists.** `RedisProvider` interface (`get`/`set`/`delete`/`setNX`/`incr`) with `redis-provider.factory.ts` picking `UpstashRedisProvider` (implemented, live) or `ElastiCacheRedisProvider` (stub). This is the exact seam to hang the new caching layer on — no new infra, no new provider pattern to invent.
- `VoiceAgentVoice` type (`backend/src/types/index.ts:765`) is currently OpenAI-only voice IDs (`alloy | ash | ballad | coral | echo | sage | shimmer | verse | marin | cedar`). This has to change — see §3.
- No telephony code anywhere. No Plivo/Exotel dependency in `backend/package.json`. Confirms the earlier finding: today's voice product is 100% browser-mic.

---

## 1. Provider pricing you're building against

From the verified cost model (see `voice-calling-cost-and-pricing-plan.md`):

| Engine | Approx cost/min (mid-call talk ratio) |
|---|---:|
| Sarvam cascade (Saaras v3 STT + GLM 5.2 + Bulbul v3 TTS) | ≈ ₹1.35–1.40 |
| OpenAI `gpt-realtime-mini` | ≈ ₹1.31–1.70 (cached/uncached) |
| OpenAI `gpt-realtime` (flagship, not used here) | ≈ ₹4.19–5.44 |

Sarvam is the default engine per your decision; `gpt-realtime-mini` is the fallback — not the flagship model, which keeps the fallback path's cost close to Sarvam's rather than 3x more expensive. Good choice: a fallback that's dramatically pricier than your primary is a bad incentive to fix outages fast.

---

## 2. Phase 1 — the provider seam (this is the actual unlock)

**Goal:** `session.ts` never talks to `wss://api.openai.com` directly again. It talks to a `VoiceEngineProvider` interface; two classes implement it; a factory with fallback logic picks between them.

### 2.1 Extend the interface

The existing `VoiceProvider` interface in `providers/voice-provider.ts` is shaped for a connection-pooled multi-session manager (`connect(config) → session`, keyed by `sessionId`). That doesn't match how `session.ts` actually works today (one `VoiceSession` object per call, holding its own sockets directly) — implementing the old interface as-is would mean a rewrite, not a swap. Replace it with an interface shaped like the code that exists:

```ts
// backend/src/providers/voice-provider.ts (replace existing contents)

export type EngineEvent =
  | { type: 'ready' }
  | { type: 'audio'; data: string /* base64 */ }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; isFinal: boolean }
  | { type: 'speech_started' }         // caller started talking -> drives barge-in
  | { type: 'response_done'; usage: EngineUsage }
  | { type: 'tool_call'; name: string; args: unknown; callId: string }
  | { type: 'error'; message: string; fatal: boolean } // fatal=true triggers fallback

export interface EngineUsage {
  inputTokensOrUnits: number
  outputTokensOrUnits: number
  audioSeconds: number            // engine-agnostic billing unit; every engine can report this
  costEstimateInrPaise: number    // computed by the provider from its own rate card
}

export interface VoiceEngineConfig {
  instructions: string
  voice: string                   // engine-specific voice id, see §3
  languageCode?: string           // 'hi-IN' | 'en-IN' | ... — Sarvam needs this, OpenAI ignores it
  tools: Array<{ name: string; description: string; parameters: unknown }>
}

export interface VoiceEngineProvider {
  readonly name: 'sarvam' | 'openai-realtime-mini'
  connect(config: VoiceEngineConfig, onEvent: (e: EngineEvent) => void): Promise<void>
  sendAudio(chunk: string /* base64, engine-native format, see §4 */): void
  commitTurn(): void              // "caller stopped talking, generate a response"
  sendToolResult(callId: string, output: string): void
  interrupt(): void               // barge-in: cancel in-flight response
  close(): void
}
```

This is deliberately event-driven and format-agnostic at the interface boundary — `VoiceSession` doesn't know or care whether the underlying transport is one WebSocket (OpenAI) or two (Sarvam STT + Sarvam TTS are separate endpoints, see §4).

### 2.2 New files

```
backend/src/providers/voice-engines/
  openai-realtime-provider.ts    ← extract session.ts's OpenAI logic, unchanged behavior, new shape
  sarvam-provider.ts             ← new
  voice-engine-factory.ts        ← picks primary, watches for fatal errors, swaps to fallback
```

**`openai-realtime-provider.ts`** is a pure extraction: move the `openaiWs` construction, `session.update` payload, `handleOpenAIMessage` translation, and function-call handling out of `VoiceSession` into a class implementing `VoiceEngineProvider`. Change `REALTIME_MODEL` from `'gpt-realtime'` to `'gpt-realtime-mini'` (confirm the exact API model string against OpenAI's model list before deploying — pricing pages sometimes use a marketing name like `gpt-realtime-2.1-mini` that differs from the literal API `model` parameter). No behavior change beyond the model string and the reshaping into the new interface — this is the safe, test-first step.

**`sarvam-provider.ts`** is new integration work. Sarvam's realtime stack is two separate WebSocket connections, not one combined socket like OpenAI's:

- STT: `wss://api.sarvam.ai/speech-to-text/ws?language-code=<code>&model=saaras:v3&sample_rate=16000`, header `Api-Subscription-Key: <key>`. Send `{"audio":{"data":"<base64>","sample_rate":"16000","encoding":"audio/wav"}}` per chunk (or raw PCM with `input_audio_codec` — confirm exact PCM framing against Sarvam's SDK before hand-rolling this; their docs are not fully explicit on chunk framing for raw PCM). Receive `{"type":"data","data":{"transcript":"...", "request_id":...}}`.
- TTS: `wss://api.sarvam.ai/text-to-speech/ws`, same auth header. First message is `{"type":"config","data":{"language_code":"hi-IN","speaker":"<voice>"}}`, then `{"type":"text","data":{"text":"..."}}` per chunk of LLM output, then `{"type":"flush"}` to end. Receive `{"type":"audio","data":{"audio":"<base64>","content_type":"..."}}`.
- LLM: Sarvam does **not** provide a bundled realtime conversational loop the way OpenAI's Realtime API does — you drive the STT→LLM→TTS pipeline yourself. The LLM call is a normal chat-completions request to Sarvam's GLM 5.2 endpoint (OpenAI-compatible-style REST, not a websocket), fed the transcript from STT plus your existing RAG tool-calling logic, streamed token-by-token into the TTS websocket as text arrives — this is what makes the cascade's latency competitive at all. **This is meaningfully more integration work than the OpenAI provider**, because you're building the orchestration loop OpenAI's Realtime API gives you for free. Budget for this explicitly; it's not a drop-in swap.
- Turn detection (deciding the caller stopped talking) is your responsibility in the Sarvam path — OpenAI's `server_vad` has no Sarvam equivalent surfaced in their streaming API docs. Reuse the existing browser-side commit signal (`message.type === 'commit'` in `session.ts`, already sent by the widget) rather than trying to build server-side VAD for v1; this also sidesteps the endpointing-latency problem raised in the earlier cost/latency doc until you're ready to invest in it.

**`voice-engine-factory.ts`** — the fallback logic your decision actually needs:

```ts
export async function createVoiceEngine(
  config: VoiceEngineConfig,
  onEvent: (e: EngineEvent) => void
): Promise<VoiceEngineProvider> {
  const primary = new SarvamProvider()
  try {
    await withTimeout(primary.connect(config, onEvent), CONNECT_TIMEOUT_MS)
    return primary
  } catch (err) {
    console.error('[VoiceEngine] Sarvam connect failed, falling back to OpenAI:', err)
    const fallback = new OpenAIRealtimeProvider()
    await fallback.connect(config, onEvent)
    return fallback
  }
}
```

Two failure modes to handle, not one: **connect-time failure** (above — Sarvam unreachable when the call starts) and **mid-call failure** (a Sarvam socket drops or errors 40 seconds into a live call). Mid-call fallback is harder — you can't silently swap engines without a gap the caller hears — so for v1, treat mid-call Sarvam failure as: end the Sarvam leg, tell `VoiceSession` to reconnect fresh on OpenAI, and accept a ~1-2 second audio gap with a "one moment" filler if you have one cached (see §5). Log every fallback event (engine name switched from/to, callId, reason) into `voice_call_logs` — you'll want to know your real fallback rate before you trust this in front of an enterprise client.

### 2.3 Change to `session.ts`

`VoiceSession`'s constructor currently does `new WebSocket(REALTIME_URL, ...)` directly. Replace that with `await createVoiceEngine(config, this.handleEngineEvent.bind(this))`, and replace `handleOpenAIMessage` with a single `handleEngineEvent(e: EngineEvent)` switch that does what the current handler does per event type (already event-shaped this way in the existing code — `response.output_audio.delta` → send audio to browser, `input_audio_buffer.speech_started` → barge-in, etc.), just against the new engine-agnostic event names. `writeCallLog` gains an `engine: 'sarvam' | 'openai-realtime-mini'` and `fallbackOccurred: boolean` field — add these to the `VoiceCallLog` type in `types/index.ts` and to `voice-repository.ts`'s write path. You'll want this field the first week just to see your real Sarvam-vs-fallback split.

---

## 3. Voice identity mapping

`VoiceAgentVoice` (`types/index.ts:765`) is currently OpenAI's ten voice names. Sarvam's Bulbul v3 has its own named speakers (e.g. `anushka`, per the docs example — get the full current roster from Sarvam's model reference before shipping, it's not enumerated in what I fetched). These are not the same namespace, so a `VoiceAgent.voice` value of `'coral'` means nothing to Sarvam.

Do this with a mapping table, not a type union swap (a type union swap breaks every existing `VoiceAgent` record's `voice` field): add a `voiceMap: Record<VoiceAgentVoice, { sarvamSpeaker: string; openaiVoice: VoiceAgentVoice }>` constant, and have each provider's `connect()` resolve `config.voice` through this map to its own engine's native voice ID. This also means: when a client picks a voice in the dashboard, they're picking a Vyostra-branded voice persona ("Warm Female," "Confident Male," etc.), not a raw OpenAI ID — worth doing regardless of this migration, since `alloy`/`coral`/`cedar` mean nothing to a non-technical client anyway.

---

## 4. Audio format — the part that's easy to get wrong silently

- **OpenAI Realtime:** `audio/pcm @ 24000 Hz`, already hardcoded in 4 places in `session.ts` (per the original engineering plan's finding).
- **Sarvam STT:** accepts 8kHz or 16kHz, WAV or PCM.
- **Sarvam TTS:** outputs at 22050 Hz (bulbul:v2) or 24000 Hz (bulbul:v3) by default.
- **Browser widget:** whatever the existing `voice-relay` browser-side capture uses today — check the frontend widget's `AudioContext` sample rate before assuming it matches either of the above.

None of these three numbers agree by default. You need one resampling point, not three: standardize on 16kHz PCM as the internal format the browser sends and `VoiceSession` receives, and let each provider's implementation resample at its own boundary (Sarvam wants 16kHz already — no-op there; OpenAI wants 24kHz — resample up once, in `openai-realtime-provider.ts`, not in the browser or in `VoiceSession`). Keep resampling logic inside each provider file, never in `session.ts` — that's exactly the kind of engine-specific detail the interface in §2.1 exists to hide.

---

## 5. Caching layer — using the Redis you already have

You don't need a new cache; `getRedisProvider()` (`providers/redis/redis-provider.factory.ts`) already gives you `get`/`set`/`delete` against Upstash. Two caches, both keyed and TTL'd through that same interface:

### 5.1 TTS audio cache (biggest win, build this first)

New file: `backend/src/services/voice-tts-cache-service.ts`

```ts
import { getRedisProvider } from '../providers/redis/redis-provider.factory.js'
import { createHash } from 'node:crypto'

function cacheKey(text: string, engine: string, voiceId: string): string {
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 24)
  return `voice:tts:${engine}:${voiceId}:${hash}`
}

export async function getCachedAudio(text: string, engine: string, voiceId: string): Promise<string | null> {
  return await getRedisProvider().get(cacheKey(text, engine, voiceId))
}

export async function setCachedAudio(text: string, engine: string, voiceId: string, base64Audio: string): Promise<void> {
  // 30-day TTL: greetings and disclosure scripts don't change often, but do
  // change (rebrand, price update, regulatory text edit) — a hard expiry
  // means a stale cached clip self-heals within a month even if nobody
  // remembers to invalidate it by hand.
  await getRedisProvider().set(cacheKey(text, engine, voiceId), base64Audio, 30 * 24 * 3600)
}
```

Wire this into whichever provider is generating TTS (Sarvam's TTS websocket, or OpenAI's `response.output_audio.delta` accumulated into a full clip) at the point where a full utterance completes: check cache before opening the TTS connection for a known-fixed string (the agent's configured `greetingMessage` is the obvious first target — it's sent on 100% of calls and never varies within a call), and write to cache after synthesizing anything that looks like a fixed script rather than a RAG-retrieved or model-generated answer. Practically: only cache text that comes from `VoiceAgent.greetingMessage`, `VoiceAgent.systemPrompt`-configured fixed lines, or a to-be-built list of canned phrases (the original plan's "let me check that," business-hours statement, disclosure line) — don't try to cache arbitrary LLM output, which is different often enough that the cache-hit rate would be near zero and you'd be storing audio you'll never read back. `getRedisProvider().set` already logs-and-swallows Redis errors (see `upstash-provider.ts`), so a cache-layer failure degrades to "just call TTS," never breaks a call — no extra error handling needed in the cache service itself, but each provider's TTS call site should treat a cache miss and a cache error identically (both mean: call TTS).

Redis value size: Upstash's REST API and free/low tiers have per-value limits (check your plan — historically ~1MB free tier, higher on paid). A cached greeting clip at 16kHz PCM is roughly 32KB/second, so a 5-second greeting is ~160KB — fine. Don't cache clips longer than a few seconds this way; for anything longer, store the S3 key in Redis and the audio bytes in S3 (you already have an S3 client wired for KB files in `lib/s3.ts` — reuse it) rather than the raw bytes in Redis.

### 5.2 Semantic FAQ cache (second priority)

This one is riskier (a wrong cached answer is worse than a slow correct one) and needs your existing embedding infra, not just Redis. You already run `text-embedding-3-small` + Pinecone for RAG (`rag-service.ts`, `vector-repository.ts`) scoped by `botId`/`agentId`. Reuse the same Pinecone index with a distinct namespace suffix (e.g. `${agentId}:faq-cache`, mirroring the existing `Every Pinecone query MUST be scoped by botId` rule from `CLAUDE.md`) holding (question-embedding → answer-text) pairs, populated from the `search_knowledge_base` tool's own past results — i.e. this is a cache of RAG lookups, not a replacement for RAG. Before calling the LLM, embed the transcript, query this namespace, and if similarity ≥ 0.92 (tune against real transcripts before trusting it) return the cached answer text directly into the TTS step, skipping both the RAG chunk fetch and the LLM call. Ship this after you have a few weeks of real call transcripts to tune the threshold against — shipping it blind risks a caller getting a confidently wrong answer, which costs you more in trust than the LLM call would have cost in rupees.

---

## 6. Sequencing

1. **Extract `OpenAIRealtimeProvider`** from `session.ts` into the new interface shape, model string unchanged. Deploy. Verify zero behavior change — this is the safety-net step, and it's the same "Phase 1" the original engineering plan already scoped, just now shaped around a validated interface instead of the placeholder one.
2. **Build `SarvamProvider`** against a test agent, no fallback logic yet — hardcode it as the only engine, verify a real call end-to-end (STT → your RAG tool → GLM → TTS → browser), and get a real turn-latency measurement on your own audio. This is also your chance to actually answer the open question from the cost doc: does Sarvam's cascade hit the numbers the vendor implies, or not.
3. **Add the factory with fallback**, connect-time first, mid-call second.
4. **Switch `REALTIME_MODEL` fallback path to `gpt-realtime-mini`**, confirm the literal API model string.
5. **Add TTS caching** for greetings first, expand the canned-phrase list once you see real call transcripts.
6. **Add semantic FAQ caching**, tuned against a few weeks of real transcripts.
7. **Plivo telephony transport** (`voice-relay/transports/plivo-stream.ts`), sitting alongside the browser transport in `server.ts`, translating Plivo's `media`/`playAudio` JSON events (§ shown above: `audio/x-mulaw @ 8000`) to/from the same `VoiceEngineProvider` interface — this is where the μ-law↔PCM transcoding from the original engineering plan's Phase 2 lands, and it's a transport change, not an engine change, precisely because the seam in §2 now exists.

Steps 1–4 are the part you asked for today. Step 7 is queued for whenever you're ready to move off browser-only calling — nothing above blocks it, and nothing above needs to be redone to get there.

---

## Sources
- Code paths above verified by reading `~/Desktop/RigaChat` directly on 3 Sep 2026 (`backend/src/voice-relay/`, `backend/src/providers/`, `backend/src/services/voice-service.ts`, `backend/src/types/index.ts`, `backend/package.json`).
- [Sarvam STT WebSocket reference](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe/ws)
- [Sarvam TTS WebSocket reference](https://docs.sarvam.ai/api-reference-docs/text-to-speech/stream)
- [Sarvam API pricing](https://www.sarvam.ai/api-pricing)
- [Plivo audio streaming for voice agents](https://www.plivo.com/docs/voice-agents/audio-streaming/overview)
- [OpenAI Realtime API cost guide](https://developers.openai.com/api/docs/guides/realtime-costs)
