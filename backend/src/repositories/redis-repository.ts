import { createHash, randomUUID } from 'crypto'
import { getRedisProvider } from '../providers/redis/redis-provider.factory.js'
import {
  CONTACT_RATE_LIMIT_SECONDS,
  QUICK_SIGNUP_RATE_LIMIT_SECONDS,
  RESYNC_COOLDOWN_SECONDS,
} from '../config/entitlements-config.js'
import type { Entitlements, MetaFormQuestion } from '../types/index.js'

const EMBEDDING_TTL = 24 * 60 * 60        // 24 hours
const ANSWER_TTL = 7 * 24 * 60 * 60       // 7 days
// A Meta lead form cannot be edited once it has run -- editing produces a copy
// under a new id -- so its schema is immutable for the life of the form. The
// TTL is a safety net against a stale cache after a Meta-side change, not a
// correctness requirement.
const META_FORM_SCHEMA_TTL = 30 * 24 * 60 * 60  // 30 days

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

// A bot's answer cache is addressed through a generation token, so a KB write
// can invalidate every cached answer for that bot with one SET instead of a
// pattern delete (RedisProvider has no scan). Old keys are orphaned and age out
// on ANSWER_TTL.
//
// A random token, not an INCR counter: incr() only sets its TTL on the first
// write, so a counter that expired would restart at 0 and count back up into
// generations whose answers are still cached -- serving pre-edit answers again.
// A token never repeats. Its TTL matches ANSWER_TTL and is refreshed on every
// bump, so by the time it lapses back to the default, every answer written
// under that default before the bump has expired too.
const DEFAULT_ANSWER_GENERATION = '0'

async function getAnswerCacheGeneration(botId: string): Promise<string> {
  const redis = getRedisProvider()
  return (await redis.get(`kbgen:${botId}`)) ?? DEFAULT_ANSWER_GENERATION
}

async function answerKey(text: string, botId: string): Promise<string> {
  const generation = await getAnswerCacheGeneration(botId)
  return `ans:${botId}:${generation}:${hashText(text)}`
}

export async function getCachedAnswer(
  text: string,
  botId: string
): Promise<string | null> {
  try {
    const redis = getRedisProvider()
    return await redis.get(await answerKey(text, botId))
  } catch {
    return null
  }
}

// If the generation read fails, the whole write is skipped rather than falling
// back to the default generation -- an answer cached under the wrong generation
// is exactly the stale read this scheme exists to prevent.
export async function setCachedAnswer(
  text: string,
  botId: string,
  answer: string
): Promise<void> {
  try {
    const redis = getRedisProvider()
    const key = await answerKey(text, botId)
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
    await redis.delete(await answerKey(text, botId))
  } catch (err) {
    console.error('Failed to delete cached answer:', err)
  }
}

// Throws on a Redis error: the caller decides whether a KB write should fail
// because its cached answers could not be invalidated.
export async function bumpAnswerCacheGeneration(botId: string): Promise<void> {
  const redis = getRedisProvider()
  await redis.set(`kbgen:${botId}`, randomUUID(), ANSWER_TTL)
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


// The form schema behind mapMetaFieldData's most authoritative layer. Cached
// per FORM rather than per lead: one Graph call covers every lead that form
// ever produces, which is what keeps the schema lookup off the lead-capture
// path's cost.
//
// Both halves swallow their errors, like the caches above: a Redis outage must
// degrade the mapping to the keyword heuristics, never fail a lead.
export async function getCachedFormQuestions(formId: string): Promise<MetaFormQuestion[] | null> {
  try {
    const redis = getRedisProvider()
    const value = await redis.get(`metaform:${formId}`)
    if (!value) return null
    return JSON.parse(value) as MetaFormQuestion[]
  } catch {
    return null
  }
}

export async function setCachedFormQuestions(formId: string, questions: MetaFormQuestion[]): Promise<void> {
  try {
    const redis = getRedisProvider()
    await redis.set(`metaform:${formId}`, JSON.stringify(questions), META_FORM_SCHEMA_TTL)
  } catch (error) {
    console.error(`Failed to cache Meta form schema ${formId}:`, error)
  }
}
