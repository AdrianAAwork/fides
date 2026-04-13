'use client'

interface Props {
  style?: React.CSSProperties
  /** Pass a unique cache-busting key after a fresh upload (e.g. a timestamp) */
  refreshKey?: number
}

export default function OrgLogo({ style, refreshKey = 0 }: Props) {
  const src = `/api/org/logo-image${refreshKey ? `?v=${refreshKey}` : ''}`

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={style} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
}
