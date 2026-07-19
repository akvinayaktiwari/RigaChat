import type { RedisProvider, RedisProviderName } from './redis-provider.interface.js'

// Stub — not implemented yet
// Wire in when migrating from Upstash to ElastiCache
// All methods throw to make incomplete usage obvious
export class ElastiCacheRedisProvider implements RedisProvider {
  async get(_key: string): Promise<string | null> {
    throw new Error('ElastiCache provider not yet implemented')
  }

  async set(
    _key: string,
    _value: string,
    _ttlSeconds: number
  ): Promise<void> {
    throw new Error('ElastiCache provider not yet implemented')
  }

  async delete(_key: string): Promise<void> {
    throw new Error('ElastiCache provider not yet implemented')
  }

  async setNX(_key: string, _value: string, _ttlSeconds: number): Promise<boolean> {
    throw new Error('ElastiCache provider not yet implemented')
  }

  getProviderName(): RedisProviderName {
    return 'elasticache'
  }
}
