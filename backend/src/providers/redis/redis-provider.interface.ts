export type RedisProviderName = 'upstash' | 'elasticache'

export interface RedisProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  // Atomic set-if-not-exists with expiry (single command, not GET-then-SET).
  // Returns true if the key was set (lock acquired), false if it already existed.
  setNX(key: string, value: string, ttlSeconds: number): Promise<boolean>
  getProviderName(): RedisProviderName
}
