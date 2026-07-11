import { generateEmbedding, generateSuggestedQuestions } from './openai-service.js'
import {
  deleteSuggestedQuestionsCache,
  getRepresentativeChunks,
  upsertSuggestedQuestionCache,
} from '../repositories/vector-repository.js'
import { getPublicBotConfig, updateBot } from '../repositories/bot-repository.js'
import { setCachedAnswer } from '../repositories/redis-repository.js'
import type { PrewarmResult, SuggestedQuestion } from '../types/index.js'

const EMPTY_RESULT: PrewarmResult = { generated: 0, prewarmSuccess: 0, prewarmFailed: 0 }

async function prewarmQuestion(botId: string, question: SuggestedQuestion): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(question.question)
    return await upsertSuggestedQuestionCache(botId, question, embedding)
  } catch {
    return false
  }
}

async function prewarmAllQuestions(
  botId: string,
  questions: SuggestedQuestion[]
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  for (const question of questions) {
    const ok = await prewarmQuestion(botId, question)
    if (ok) success++
    else failed++
  }

  return { success, failed }
}

async function prewarmRedisAnswers(botId: string, questions: SuggestedQuestion[]): Promise<void> {
  for (const question of questions) {
    await setCachedAnswer(question.question, botId, question.answer)
  }
  console.log(`Redis answer cache pre-warmed for bot ${botId}: ${questions.length} questions`)
}

async function saveSuggestionsToBot(botId: string, questions: SuggestedQuestion[]): Promise<void> {
  const bot = await getPublicBotConfig(botId)
  if (!bot) return
  await updateBot(botId, bot.clientId, { suggestedQuestions: questions })
}

export async function generateAndPrewarmSuggestions(
  botId: string,
  kbContent: string,
  botName: string
): Promise<PrewarmResult> {
  try {
    const questions = await generateSuggestedQuestions(kbContent, botName)
    if (questions.length === 0) return EMPTY_RESULT

    await deleteSuggestedQuestionsCache(botId)
    await saveSuggestionsToBot(botId, questions)

    const { success, failed } = await prewarmAllQuestions(botId, questions)
    console.log(`Pre-warm complete for bot ${botId}: ${success} success, ${failed} failed`)

    // Pre-warm Redis answer cache for instant chip responses — suggested
    // question clicks then hit Redis at ~1ms instead of Pinecone at ~400ms,
    // with zero LLM call and zero OpenAI embedding call.
    await prewarmRedisAnswers(botId, questions)

    return { generated: questions.length, prewarmSuccess: success, prewarmFailed: failed }
  } catch (error) {
    console.error(`Failed to generate and prewarm suggestions for bot ${botId}:`, error)
    return EMPTY_RESULT
  }
}

export async function getKbContentForBot(botId: string): Promise<string> {
  try {
    const chunks = await getRepresentativeChunks(botId, 40)
    const content = chunks.join('\n')
    return content.slice(0, 6000)
  } catch {
    return ''
  }
}
