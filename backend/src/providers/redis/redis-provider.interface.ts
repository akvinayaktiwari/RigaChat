export type RedisProviderName = 'upstash' | 'elasticache'

export interface RedisProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  // Atomic set-if-not-exists with expiry (single command, not GET-then-SET).
  // Returns true if the key was set (lock acquired), false if it already existed.
  setNX(key: string, value: string, ttlSeconds: number): Promise<boolean>
  // Atomic increment with an expiry set on first write, for fixed-window rate
  // limiting. Returns the count AFTER incrementing, or null when the store is
  // unreachable -- callers decide what an unknown count means, and for rate
  // limiting that must be "allow" (see lib/rate-limit.ts).
  //
  // setNX cannot express this: it is one-shot, so it can only answer "has this
  // happened before", not "how many times in this window".
  incr(key: string, ttlSeconds: number): Promise<number | null>
  getProviderName(): RedisProviderName
}
