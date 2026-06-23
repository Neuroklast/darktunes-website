/**
 * Minimal press-bio PDF for journalist downloads (single tier per file).
 */

import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

let fontsRegistered = false

function ensureFonts(): void {
  if (fontsRegistered) return
  try {
    Font.register({
      family: 'Inter',
      fonts: [
        {
          src: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-400-normal.woff2',
          fontWeight: 400,
        },
        {
          src: 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-700-normal.woff2',
          fontWeight: 700,
        },
      ],
    })
    Font.registerHyphenationCallback((word) => [word])
  } catch {
    // Helvetica fallback
  } finally {
    fontsRegistered = true
  }
}

ensureFonts()

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    backgroundColor: '#101010',
    color: '#ffffff',
    padding: 48,
  },
  artist: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 4,
  },
  tier: {
    fontSize: 11,
    color: '#a0a0a0',
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  quote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#a0a0a0',
    marginBottom: 16,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#493687',
  },
  body: {
    fontSize: 11,
    lineHeight: 1.55,
    color: '#ffffff',
  },
})

export interface BioPdfDocumentProps {
  artistName: string
  tierLabel: string
  body: string
  pressQuote?: string
}

export function BioPdfDocument({ artistName, tierLabel, body, pressQuote }: BioPdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.artist}>{artistName}</Text>
        <Text style={styles.tier}>{tierLabel}</Text>
        {pressQuote ? <Text style={styles.quote}>&ldquo;{pressQuote}&rdquo;</Text> : null}
        <View>
          {body.split('\n').map((line, index) => (
            <Text key={`line-${index}`} style={styles.body}>
              {line || ' '}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  )
}