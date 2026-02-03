// 간단한 인메모리 캐시 (Vercel Serverless에서 재사용)
// 트렌드 데이터는 하루에 한 번만 업데이트되므로 캐싱 효과 큼

interface CacheEntry<T> {
  data: T
  expiry: number
}

class SimpleCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map()

  // 기본 TTL: 1시간 (트렌드 데이터용)
  private defaultTTL = 60 * 60 * 1000

  set<T>(key: string, data: T, ttlMs?: number): void {
    const expiry = Date.now() + (ttlMs || this.defaultTTL)
    this.cache.set(key, { data, expiry })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiry) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  // 캐시 키 생성 헬퍼
  static makeKey(...parts: string[]): string {
    return parts.join(':')
  }
}

// 싱글톤 인스턴스
export const cache = new SimpleCache()

// 캐시 래퍼 함수 (async 함수용)
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  // 캐시 확인
  const cached = cache.get<T>(key)
  if (cached !== null) {
    console.log(`[Cache HIT] ${key}`)
    return cached
  }

  // 캐시 미스 - 데이터 가져오기
  console.log(`[Cache MISS] ${key}`)
  const data = await fetcher()

  // 캐시 저장
  cache.set(key, data, ttlMs)
  return data
}

// TTL 상수
export const CACHE_TTL = {
  TREND: 60 * 60 * 1000,      // 1시간 (트렌드 데이터)
  SHEET: 5 * 60 * 1000,       // 5분 (시트 데이터)
  KEYWORD: 30 * 60 * 1000,    // 30분 (키워드 분석)
}
