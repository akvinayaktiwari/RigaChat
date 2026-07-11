import type OpenAI from 'openai'
import { openaiClient } from '../lib/openai.js'
import { getCachedEmbedding, setCachedEmbedding } from '../repositories/redis-repository.js'
import type { ConversationMessage, SuggestedQuestion } from '../types/index.js'

interface StreamChatParams {
  systemPrompt: string
  contextChunks: string[]
  conversationHistory: ConversationMessage[]
  userMessage: string
  botName: string
}

interface RawSuggestedQuestion {
  id?: unknown
  question?: unknown
  answer?: unknown
  emoji?: unknown
  category?: unknown
  order?: unknown
}

const VALID_SUGGESTION_CATEGORIES = new Set(['pricing', 'features', 'support', 'general', 'contact'])

function isValidCategory(value: unknown): value is SuggestedQuestion['category'] {
  return typeof value === 'string' && VALID_SUGGESTION_CATEGORIES.has(value)
}

function toSuggestedQuestion(raw: RawSuggestedQuestion, index: number): SuggestedQuestion | null {
  if (typeof raw.question !== 'string' || !raw.question.trim()) return null
  if (typeof raw.answer !== 'string' || !raw.answer.trim()) return null

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `q${index + 1}`,
    question: raw.question,
    answer: raw.answer,
    emoji: typeof raw.emoji === 'string' && raw.emoji ? raw.emoji : '✨',
    category: isValidCategory(raw.category) ? raw.category : 'general',
    order: typeof raw.order === 'number' ? raw.order : index + 1,
  }
}

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

function parseSuggestedQuestionsResponse(raw: string): SuggestedQuestion[] {
  try {
    const parsed: unknown = JSON.parse(stripMarkdownFences(raw))
    if (!Array.isArray(parsed)) return []

    return (parsed as RawSuggestedQuestion[])
      .map((item, index) => toSuggestedQuestion(item, index))
      .filter((item): item is SuggestedQuestion => item !== null)
  } catch {
    return []
  }
}

function buildSuggestionPrompt(botName: string, kbContent: string): string {
  return `You are analyzing a knowledge base for an AI chatbot named ${botName}. Generate the 10 most likely questions a website visitor would ask, with accurate answers drawn ONLY from the provided content. Return ONLY a valid JSON array. No markdown, no preamble, no explanation. If you cannot generate 10 questions from the content, generate as many as possible (minimum 4).

Format:
[
  {
    "id": "q1",
    "question": "What is your pricing?",
    "answer": "Full answer here...",
    "emoji": "💎",
    "category": "pricing",
    "order": 1
  }
]

Categories: pricing, features, support, general, contact
Emoji should match the category:
  pricing → 💎
  features → 🚀
  support → 🤝
  general → ✨
  contact → 📞

Knowledge base content:
${kbContent}`
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Check Redis first (Mumbai ~1ms)
  const cached = await getCachedEmbedding(text)
  if (cached) {
    console.log('Embedding cache hit (Redis)')
    return cached
  }

  try {
    // Cache miss — call OpenAI (~800ms)
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    const embedding = response.data[0].embedding

    // Save to Redis for next time (fire and forget)
    setCachedEmbedding(text, embedding).catch((err) =>
      console.error('Embedding cache write failed:', err)
    )

    return embedding
  } catch (error) {
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const EMBEDDING_BATCH_SIZE = 100

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  })
  return response.data.map((item) => item.embedding)
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  try {
    const results: number[][] = []
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE)
      results.push(...(await embedBatch(batch)))
    }
    return results
  } catch (error) {
    throw new Error(
      `Failed to generate batch embeddings: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

interface ChatCompletionParams {
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  temperature: number
}

export async function generateChatCompletion(params: ChatCompletionParams): Promise<string> {
  const { systemPrompt, userPrompt, maxTokens, temperature } = params
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })
  return response.choices[0]?.message?.content ?? ''
}

export async function* streamChatResponse(params: StreamChatParams): AsyncGenerator<string> {
  const { systemPrompt, contextChunks, conversationHistory, userMessage, botName } = params

  const fullSystemPrompt = `${systemPrompt}

Context:
${contextChunks.join('\n\n')}`

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: fullSystemPrompt },
    ...conversationHistory.map(
      (entry): OpenAI.ChatCompletionMessageParam => ({ role: entry.role, content: entry.content })
    ),
    { role: 'user', content: userMessage },
  ]

  try {
    const stream = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      max_tokens: 300,
      messages,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        yield delta
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to stream chat response: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

interface PageFacts {
  facts: string
  paragraphs: string
}

interface RawPageFacts {
  facts: string | string[]
  paragraphs: string | string[]
}

const FACT_EXTRACTION_MIN_LENGTH = 200
const FACT_EXTRACTION_INPUT_CHARS = 3000
const FACT_EXTRACTION_MAX_TOKENS = 1000

const FACT_EXTRACTION_SYSTEM_PROMPT = `You are a content analyzer for an AI chatbot.
Extract information from this business webpage that a customer would want to know.

Return a JSON object with exactly two fields:
{
  "facts": "Key facts as a single string with each fact on its own line starting with a dash. Example:\\n- Location: Whitefield, Bangalore\\n- Price: Starting ₹1.2 Cr\\n- Configurations: 2BHK, 3BHK, 4BHK\\nOnly facts explicitly stated on the page.",
  "paragraphs": "Clean readable paragraphs as a single string. Remove navigation, footers, cookie notices, legal boilerplate. Keep only meaningful business content in complete sentences."
}

Return ONLY the JSON object. No markdown. No preamble.`

function isPageFacts(value: unknown): value is RawPageFacts {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const hasFacts = typeof v.facts === 'string' || Array.isArray(v.facts)
  const hasParagraphs = typeof v.paragraphs === 'string' || Array.isArray(v.paragraphs)
  return hasFacts && hasParagraphs
}

function normalizePageFactsField(value: string | string[]): string {
  return Array.isArray(value) ? value.join('\n') : value
}

export async function extractPageFacts(
  pageText: string,
  pageTitle: string,
  botName: string
): Promise<PageFacts> {
  if (pageText.length < FACT_EXTRACTION_MIN_LENGTH) {
    return { facts: '', paragraphs: pageText }
  }

  try {
    const response = await generateChatCompletion({
      systemPrompt: FACT_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: `Business: ${botName}\nPage: ${pageTitle}\n\nContent:\n${pageText.slice(0, FACT_EXTRACTION_INPUT_CHARS)}`,
      maxTokens: FACT_EXTRACTION_MAX_TOKENS,
      temperature: 0,
    })

    const parsed: unknown = JSON.parse(stripMarkdownFences(response))
    if (!isPageFacts(parsed)) {
      throw new Error('Fact extraction returned an unexpected shape')
    }

    const result: PageFacts = {
      facts: normalizePageFactsField(parsed.facts),
      paragraphs: normalizePageFactsField(parsed.paragraphs),
    }
    console.log(
      `Facts extracted for "${pageTitle}": ${result.facts ? 'yes' : 'no'}, paragraphs: ${result.paragraphs.length} chars`
    )
    return result
  } catch (error) {
    console.error('Fact extraction failed:', error)
    return { facts: '', paragraphs: pageText }
  }
}

export async function generateSuggestedQuestions(
  kbContent: string,
  botName: string
): Promise<SuggestedQuestion[]> {
  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'system', content: buildSuggestionPrompt(botName, kbContent) }],
    })

    const content = response.choices[0]?.message?.content ?? ''
    return parseSuggestedQuestionsResponse(content)
  } catch (error) {
    console.error(`Failed to generate suggested questions for bot "${botName}":`, error)
    return []
  }
}
