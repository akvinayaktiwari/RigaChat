import type OpenAI from 'openai'
import { openaiClient } from '../lib/openai.js'
import type { ConversationMessage } from '../types/index.js'

interface StreamChatParams {
  systemPrompt: string
  contextChunks: string[]
  conversationHistory: ConversationMessage[]
  userMessage: string
  botName: string
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
