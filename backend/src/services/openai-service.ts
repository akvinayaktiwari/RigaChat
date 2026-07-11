import type OpenAI from 'openai'
import { openaiClient } from '../lib/openai.js'
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
  try {
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    return response.data[0].embedding
  } catch (error) {
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function* streamChatResponse(params: StreamChatParams): AsyncGenerator<string> {
  const { systemPrompt, contextChunks, conversationHistory, userMessage, botName } = params

  const fullSystemPrompt = `${systemPrompt}

You are ${botName}, a helpful assistant.
Only answer using the context provided below.
If the answer is not in the context, respond with:
'I don't have that information right now. Would you like to speak with our team?'
Do not make up any information.

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
      max_tokens: 1000,
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
