/**
 * CI guard: portaled menus must sit above Dialog/Sheet (z-[9999]).
 * Select/Popover/Dropdown already use z-[10000]; HoverCard/ContextMenu must match.
 */

import fs from 'fs'
import path from 'path'

const root = process.cwd()
const errors = []

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const dialogish = [
  'src/components/ui/dialog.tsx',
  'src/components/ui/alert-dialog.tsx',
  'src/components/ui/sheet.tsx',
  'src/components/ui/drawer.tsx',
]

for (const rel of dialogish) {
  const content = read(rel)
  if (!content.includes('z-[9998]') || !content.includes('z-[9999]')) {
    errors.push(`${rel}: expected Dialog-stack z-[9998] overlay and z-[9999] content`)
  }
}

const portaled = [
  'src/components/ui/popover.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/dropdown-menu.tsx',
  'src/components/ui/hover-card.tsx',
  'src/components/ui/context-menu.tsx',
  'src/components/ui/tooltip.tsx',
]

for (const rel of portaled) {
  const content = read(rel)
  if (!content.includes('z-[10000]')) {
    errors.push(`${rel}: portaled content must use z-[10000] (above dialogs)`)
  }
}

if (errors.length > 0) {
  console.error('Overlay stack contract violations:\n')
  for (const err of errors) console.error(`  • ${err}`)
  process.exit(1)
}

console.log('Overlay stack contract OK')
