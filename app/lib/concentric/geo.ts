// Shared geo-matching for territory account filtering.
// Splits addresses on commas so "denver" won't match "789 S Denver Blvd, Colorado Springs, CO"
// but will match "123 Main St, Denver, CO 80203".
export function matchesGeoTerms(address: string, geoTerms: string[]): boolean {
  if (!address || geoTerms.length === 0) return false
  const parts = address.toLowerCase().split(',').map(p => p.trim())
  return geoTerms.some(term => {
    const t = term.toLowerCase().trim()
    if (!t) return false
    // Zip codes: simple contains (specific enough to be unambiguous)
    if (/^\d{5}$/.test(t)) return address.toLowerCase().includes(t)
    // City/county/state: must be a standalone comma-separated part
    return parts.some(part => part === t || part.startsWith(t + ' ') || part.endsWith(' ' + t))
  })
}
