'use client'

import { useState, useEffect } from 'react'

interface Props {
  style?: React.CSSProperties
  /** Increment to force a re-fetch without unmounting */
  refreshKey?: number
}

export default function OrgLogo({ style, refreshKey = 0 }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/org/logo-url')
      .then(r => r.ok ? r.json() : { url: null })
      .then(d => { if (!cancelled) setUrl((d.url as string) ?? null) })
      .catch(() => { if (!cancelled) setUrl(null) })
    return () => { cancelled = true }
  }, [refreshKey])

  if (!url) return null

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={style} />
}
