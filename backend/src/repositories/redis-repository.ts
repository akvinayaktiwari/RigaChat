import { createHash } from 'crypto'
import { getRedisProvider } from '../providers/redis/redis-provider.factory.js'
import type { Entitlements } from '../types/index.js'

const EMBEDDING_TTL = 24 * 60 * 60        // 24 hours
const ANSWER_TTL = 7 * 24 * 60 * 60       // 7 days

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export async function getCachedEmbedding(
  text: string
): Promise<number[] | null> {
  try {
    const redis = getRedisProvider()
    const key = `emb:${hashText(text)}`
    const value = await redis.get(key)
    if (!value) return null
    return JSON.parse(value) as number[]
  } catch {
    return null
  }
}

export async function setCachedEmbedding(
  text: string,
  embedding: number[]
): Promise<void> {
  try {
    const redis = getRedisProvider()
    const key = `emb:${hashText(text)}`
    await redis.set(key, JSON.stringify(embedding), EMBEDDING_TTL)
    console.log(`Redis embedding cached: ${key}`)
  } catch (err) {
    console.error('Failed to cache embedding:', err)
  }
}

export async function getCachedAnswer(
  text: string,
  botId: string
): Promise<string | null> {
  try {
    const redis = getRedisProvider()
    const key = `ans:${botId}:${hashText(text)}`
    return await redis.get(key)
  } catch {
    return null
  }
}

export async function setCachedAnswer(
  text: string,
  botId: string,
  answer: string
): Promise<void> {
  try {
    const redis = getRedisProvider()
    const key = `ans:${botId}:${hashText(text)}`
    await redis.set(key, answer, ANSWER_TTL)
    console.log(`Redis answer cached: ${key}`)
  } catch (err) {
    console.error('Failed to cache answer:', err)
  }
}

export async function deleteCachedAnswer(
  text: string,
  botId: string
): Promise<void> {
  try {
    const redis = getRedisProvider()
    const key = `ans:${botId}:${hashText(text)}`
    await redis.delete(key)
  } catch (err) {
    console.error('Failed to delete cached answer:', err)
  }
}

export async function getCachedEntitlements(accountId: string): Promise<Entitlements | null> {
  try {
    const redis = getRedisProvider()
    const key = `entitlements:${accountId}`
    const value = await redis.get(key)
    if (!value) return null
    return JSON.parse(value) as Entitlements
  } catch {
    return null
  }
}

export async function setCachedEntitlements(
  accountId: string,
  entitlements: Entitlements,
  ttlSeconds: number
): Promise<void> {
  try {
    const redis = getRedisProvider()
    const key = `entitlements:${accountId}`
    await redis.set(key, JSON.stringify(entitlements), ttlSeconds)
  } catch (err) {
    console.error('Failed to cache entitlements:', err)
  }
}

export async function deleteCachedEntitlements(accountId: string): Promise<void> {
  try {
    const redis = getRedisProvider()
    const key = `entitlements:${accountId}`
    await redis.delete(key)
  } catch (err) {
    console.error('Failed to delete cached entitlements:', err)
  }
}
