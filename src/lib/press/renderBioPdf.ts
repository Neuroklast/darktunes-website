import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { BioPdfDocument, type BioPdfDocumentProps } from './BioPdfDocument'

export async function renderBioPdfBuffer(props: BioPdfDocumentProps): Promise<Buffer> {
  const element = createElement(BioPdfDocument, props) as ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)
  return Buffer.from(buffer)
}