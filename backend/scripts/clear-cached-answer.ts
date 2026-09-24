/**
 * One-off: drop a single cached chat answer for a bot.
 *
 * The answer cache is keyed by a hash of the exact question text with a 7-day
 * TTL. KB writes now invalidate a bot's whole cache (bumpAnswerCacheGeneration),
 * so this is only for dropping one known-bad answer without touching the KB.
 */
import 'dotenv/config'
import { deleteCachedAnswer } from '../src/repositories/redis-repository.js'

const [botId, ...questionParts] = process.argv.slice(2)
const question = questionParts.join(' ')

if (!botId || !question) {
  console.error('Usage: clear-cached-answer.ts <botId> <exact question text>')
  process.exit(1)
}

await deleteCachedAnswer(question, botId)
console.log(`Cleared cached answer for bot ${botId}: "${question}"`)
process.exit(0)
