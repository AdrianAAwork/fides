export type FetchBucket = 'OK_CONTENT' | 'SOFT_404' | 'BOT_CHALLENGE' | 'LOGIN_WALL' | 'TRANSIENT'

export interface SafeFetchSuccess {
  status: number
  text: string
  finalUrl: string  // actual URL after redirect chain (res.url)
}

export interface SafeFetchError {
  error: string
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchError

export interface FetchRecord {
  url: string
  bucket: FetchBucket
  httpStatus: number | null
}

export interface CertClaimed {
  certType: string
  rawLabel: string
  foundInText: string
  auditor: string | null
  category: 'security_cert' | 'privacy_framework' | 'other'
}

export interface TrustFinding {
  vendor: string
  domain: string
  state: 'FOUND_AND_READ' | 'FOUND_BUT_UNREADABLE' | 'FOUND_BUT_BLOCKED' | 'NOT_FOUND'
  confidence: 'high' | 'medium' | 'low'
  sourceUrl: string | null
  sourceTier: 'canonical' | 'fallback' | null
  platform: string | null
  certsClaimed: CertClaimed[]
  warning: string
  trace: {
    rungsAttempted: string[]
    fetchBuckets: FetchRecord[]
    modelCalls: number
    elapsedMs: number
    blockedAtTrustShapedUrl: boolean
  }
}
