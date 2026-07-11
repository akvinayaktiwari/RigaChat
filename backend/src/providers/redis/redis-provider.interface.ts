export type RedisProviderName = 'upstash' | 'elasticache'

export interface RedisProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  getProviderName(): RedisProviderName
}
