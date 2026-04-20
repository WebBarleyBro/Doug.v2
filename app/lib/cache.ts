// Simple module-level TTL cache — survives page navigations within the same session
const store = new Map<string, { data: unknown; exp: number }>()

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() < hit.exp) return Promise.resolve(hit.data as T)
  return fn().then(data => {
    store.set(key, { data, exp: Date.now() + ttlMs })
    return data
  })
}

export function invalidate(key: string) {
  store.delete(key)
}

export function invalidatePrefix(prefix: string) {
  store.forEach((_, k) => { if (k.startsWith(prefix)) store.delete(k) })
}
