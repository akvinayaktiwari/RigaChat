import { Redis } from '@upstash/redis'
import type { RedisProvider, RedisProviderName } from './redis-provider.interface.js'

export class UpstashRedisProvider implements RedisProvider {
  private readonly client: Redis

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) {
      throw new Error(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set'
      )
    }
    this.client = new Redis({ url, token })
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.client.get<string>(key)
      return value ?? null
    } catch (err) {
      console.error('Redis GET error:', err)
      return null
    }
  }

  async set(
    key: string,
    value: string,
    ttlSeconds: number
  ): Promise<void> {
    try {
      await this.client.setex(key, ttlSeconds, value)
    } catch (err) {
      console.error('Redis SET error:', err)
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key)
    } catch (err) {
      console.error('Redis DELETE error:', err)
    }
  }

  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, { ex: ttlSeconds, nx: true })
      return result === 'OK'
    } catch (err) {
      console.error('Redis SET NX error:', err)
      return false
    }
  }

  getProviderName(): RedisProviderName {
    return 'upstash'
  }
}
