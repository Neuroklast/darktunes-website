export function artistNameFromEmbed(artists: unknown): string {
  if (Array.isArray(artists)) {
    return artistNameFromEmbed(artists[0])
  }
  if (artists && typeof artists === 'object' && 'name' in artists) {
    const name = (artists as { name: unknown }).name
    return typeof name === 'string' ? name : ''
  }
  return ''
}
