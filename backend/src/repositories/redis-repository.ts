import { createHash } from 'crypto'
import { getRedisProvider } from '../providers/redis/redis-provider.factory.js'
import {
  CONTACT_RATE_LIMIT_SECONDS,
  QUICK_SIGNUP_RATE_LIMIT_SECONDS,
  RESYNC_COOLDOWN_SECONDS,
} from '../config/entitlements-config.js'
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

export async function tryAcquireResyncLock(botId: string): Promise<boolean> {
  const redis = getRedisProvider()
  const key = `resync-lock:${botId}`
  return await redis.setNX(key, '1', RESYNC_COOLDOWN_SECONDS)
}

// Keyed on ip+email, not ip alone — a shared/NAT'd IP (common on mobile
// networks, office wifi) would otherwise let one visitor's attempt lock out
// every other visitor behind the same IP, including the same person retrying
// after a typo. This still rate-limits rapid-fire attempts against a single
// email; it does not limit how many distinct emails one IP can attempt.
export async function tryAcquireQuickSignupAttempt(ip: string, email: string): Promise<boolean> {
  const redis = getRedisProvider()
  const key = `quicksignup:ratelimit:${ip}:${email}`
  return await redis.setNX(key, '1', QUICK_SIGNUP_RATE_LIMIT_SECONDS)
}

// Keyed on ip+email for the same NAT reason as tryAcquireQuickSignupAttempt
// above. Unlike the cache helpers in this file, this one does NOT swallow
// Redis errors: the caller decides what a rate-limiter outage means, and
// silently returning "allowed" would turn a Redis blip into an open relay.
export async function tryAcquireContactAttempt(ip: string, email: string): Promise<boolean> {
  const redis = getRedisProvider()
  const key = `contact:ratelimit:${ip}:${email}`
  return await redis.setNX(key, '1', CONTACT_RATE_LIMIT_SECONDS)
}

// Fixed-window counter for the public chat endpoints. Returns the count after
// this request, or null when Redis is unreachable -- the caller treats null as
// "allow", because a cache outage must not take every client's widget offline.
export async function incrementChatRate(
  bucket: 'start' | 'message',
  ip: string,
  windowSeconds: number
): Promise<number | null> {
  const redis = getRedisProvider()
  // The window is part of the key, so a window rolls over by moving to a new
  // key rather than needing a reset.
  const window = Math.floor(Date.now() / 1000 / windowSeconds)
  return await redis.incr(`chat:rl:${bucket}:${ip}:${window}`, windowSeconds)
}

