import type { RedisProvider } from './redis-provider.interface.js'
import { UpstashRedisProvider } from './upstash-provider.js'
import { ElastiCacheRedisProvider } from './elasticache-provider.js'

let instance: RedisProvider | null = null

export function getRedisProvider(): RedisProvider {
  if (instance) return instance

  const providerName = process.env.REDIS_PROVIDER ?? 'upstash'

  switch (providerName) {
    case 'upstash':
      instance = new UpstashRedisProvider()
      return instance
    case 'elasticache':
      instance = new ElastiCacheRedisProvider()
      return instance
    default:
      throw new Error(`Unknown Redis provider: ${providerName}`)
  }
}
