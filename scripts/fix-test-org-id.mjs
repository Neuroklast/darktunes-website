import fs from 'node:fs'

const ORG_LINE = "  organization_id: '00000000-0000-0000-0000-000000000000',\n"
const files = [
  'src/lib/api/artists.test.ts',
  'src/lib/api/artistProfiles.test.ts',
  'src/lib/api/artistRowMapper.test.ts',
  'src/lib/api/concerts.test.ts',
  'src/lib/api/news.test.ts',
  'src/lib/api/pressReleases.test.ts',
  'src/lib/api/releases.test.ts',
  'src/lib/api/videos.test.ts',
  'src/lib/sync/syncAll.test.ts',
  'src/lib/api/releaseSubmissions.test.ts',
]

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  if (text.includes("organization_id: '00000000")) {
    console.log('skip', file)
    continue
  }
  text = text.replace(/(\n  created_at: )/g, `\n${ORG_LINE}$1`)
  fs.writeFileSync(file, text)
  console.log('fixed', file)
}