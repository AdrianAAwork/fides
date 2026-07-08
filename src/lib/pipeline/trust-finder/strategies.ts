export interface StrategyUrl {
  url: string
  label: string
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getPlatformFromUrl(url: string): string | null {
  if (/\.safebase\.io/.test(url)) return 'safebase'
  if (/trust\.vanta\.com\//.test(url)) return 'vanta'
  if (/\.whistic\.com/.test(url)) return 'whistic'
  if (/app\.drata\.com\/trust/.test(url)) return 'drata'
  return null
}

export function getRung1Urls(domain: string): StrategyUrl[] {
  return [
    { url: `https://trust.${domain}`,                  label: 'rung1:trust.domain' },
    { url: `https://security.${domain}`,               label: 'rung1:security.domain' },
    { url: `https://${domain}/trust`,                  label: 'rung1:domain/trust' },
    { url: `https://${domain}/security`,               label: 'rung1:domain/security' },
    { url: `https://${domain}/compliance`,             label: 'rung1:domain/compliance' },
    { url: `https://${domain}/certifications`,         label: 'rung1:domain/certifications' },
    { url: `https://${domain}/legal/security`,         label: 'rung1:domain/legal/security' },
    { url: `https://${domain}/.well-known/security.txt`, label: 'rung1:well-known-security-txt' },
  ]
}

export function getRung2Urls(domain: string, vendor: string): StrategyUrl[] {
  const slug = toSlug(vendor)
  return [
    { url: `https://${slug}.safebase.io`,         label: 'rung2:safebase-slug' },
    { url: `https://trust.vanta.com/${slug}`,     label: 'rung2:vanta-slug' },
    { url: `https://${slug}.whistic.com`,         label: 'rung2:whistic-slug' },
    { url: `https://app.drata.com/trust/${slug}`, label: 'rung2:drata-slug' },
  ]
}
