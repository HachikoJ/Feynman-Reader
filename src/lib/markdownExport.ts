import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import JSZip from 'jszip'
import { getSafeLinkHref } from './safeUrl'
import { findMathExpressions, formulaKey, renderFormulaImageMap, type FormulaImage } from './mathRendering'
import { sanitizeHtml } from './sanitizeHtml'

export interface MarkdownTableExport { headers: string[]; rows: string[][] }

function safeFileName(value: string, fallback: string): string { return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim() || fallback }
function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
function escapeXml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;') }
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, ''); const cells: string[] = []; let cell = ''; let escaped = false
  for (const char of trimmed) { if (char === '|' && !escaped) { cells.push(cell.trim()); cell = '' } else { cell += char; escaped = char === '\\' && !escaped } }
  cells.push(cell.trim()); return cells
}
function isTableDivider(line: string): boolean { return splitTableRow(line).every(cell => /^:?-{3,}:?$/.test(cell)) }
function columnName(index: number): string { let value = index + 1; let name = ''; while (value > 0) { const remainder = (value - 1) % 26; name = String.fromCharCode(65 + remainder) + name; value = Math.floor((value - 1) / 26) } return name }

function worksheetCell(reference: string, value: string, style: number): string { return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>` }

function spreadsheetText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1$2')
}

export async function downloadTableAsExcel(table: MarkdownTableExport, fileName = 'markdown-table.xlsx'): Promise<void> {
  const columns = Math.max(1, table.headers.length, ...table.rows.map(row => row.length)); const headers = Array.from({ length: columns }, (_, index) => table.headers[index] || ''); const rows = table.rows.map(row => Array.from({ length: columns }, (_, index) => row[index] || ''))
  const formulaImages = await renderFormulaImageMap([headers, ...rows].flat().join('\n'))
  const drawings: Array<{ image: FormulaImage; latex: string; row: number; column: number; offset: number }> = []
  const drawingCounts = new Map<string, number>()
  ;[headers, ...rows].forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    findMathExpressions(value).forEach(expression => {
      const image = formulaImages.get(formulaKey(expression.latex, expression.display))
      if (image) {
        const cellKey = `${rowIndex}:${columnIndex}`
        const offset = drawingCounts.get(cellKey) || 0
        drawingCounts.set(cellKey, offset + 1)
        drawings.push({ image, latex: expression.latex, row: rowIndex, column: columnIndex, offset })
      }
    })
  }))
  const worksheetRows = [headers, ...rows].map((row, rowIndex) => {
    const maxFormulaCount = Math.max(0, ...Array.from(drawingCounts.entries()).filter(([key]) => key.startsWith(`${rowIndex}:`)).map(([, count]) => count))
    const height = maxFormulaCount ? Math.max(rowIndex === 0 ? 28 : 22, 24 + maxFormulaCount * 34) : undefined
    return `<row r="${rowIndex + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${row.map((value, columnIndex) => worksheetCell(`${columnName(columnIndex)}${rowIndex + 1}`, spreadsheetText(value), rowIndex === 0 ? 2 : 1)).join('')}</row>`
  }).join('')
  const widths = Array.from({ length: columns }, (_, index) => {
    const textWidth = Math.max(headers[index].length, ...rows.map(row => row[index].length)) + 3
    const formulaWidth = Math.max(0, ...drawings.filter(drawing => drawing.column === index).map(drawing => Math.ceil(drawing.image.width / 7) + 3))
    return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(48, Math.max(12, textWidth, formulaWidth))}" customWidth="1"/>`
  }).join('')
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/6/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${drawings.length ? '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`.replace('package/6', 'package/2006'),
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="AI 回复" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color rgb="FF334155"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${worksheetRows}</sheetData><autoFilter ref="A1:${columnName(columns - 1)}${rows.length + 1}"/>${drawings.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`
  }
  if (drawings.length) {
    files['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`
    files['xl/drawings/_rels/drawing1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawings.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/formula-${index + 1}.png"/>`).join('')}</Relationships>`
    files['xl/drawings/drawing1.xml'] = `<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${drawings.map((drawing, index) => {
      const width = Math.min(420, Math.max(48, drawing.image.width)); const height = Math.min(90, Math.max(24, drawing.image.height)); const rowOffset = 285750 + drawing.offset * 342900; return `<xdr:oneCellAnchor><xdr:from><xdr:col>${drawing.column}</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>${drawing.row}</xdr:row><xdr:rowOff>${rowOffset}</xdr:rowOff></xdr:from><xdr:ext cx="${width * 9525}" cy="${height * 9525}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${index + 1}" name="公式 ${index + 1}" descr="${escapeXml(drawing.latex)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`
    }).join('')}</xdr:wsDr>`
  }
  const zip = new JSZip(); Object.entries(files).forEach(([path, content]) => zip.file(path, content)); drawings.forEach((drawing, index) => zip.file(`xl/media/formula-${index + 1}.png`, drawing.image.data)); const output = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); triggerDownload(output, safeFileName(fileName.replace(/\.xls$/i, '.xlsx'), 'markdown-table.xlsx'))
}

type InlineRun = TextRun | ExternalHyperlink | ImageRun
function wordImageSize(image: FormulaImage, display: boolean): { width: number; height: number } {
  const maxWidth = display ? 440 : 180
  const maxHeight = display ? 58 : 19
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
  return {
    width: Math.max(12, Math.round(image.width * scale)),
    height: Math.max(12, Math.round(image.height * scale))
  }
}

type InlineStyle = {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  superScript?: boolean
  subScript?: boolean
  font?: string
  shading?: { type: typeof ShadingType.CLEAR; fill: string }
}

function htmlInlineRuns(value: string, formulaImages: Map<string, FormulaImage>): InlineRun[] {
  const safe = sanitizeHtml(value)
  if (!safe.trim()) return []
  const parsed = new DOMParser().parseFromString(`<div>${safe}</div>`, 'text/html')
  const visit = (node: Node, style: InlineStyle = {}): InlineRun[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.textContent) return []
      return Object.keys(style).length ? [new TextRun({ text: node.textContent, ...style })] : inlineRuns(node.textContent, formulaImages)
    }
    if (!(node instanceof Element)) return []
    const tag = node.tagName.toLowerCase()
    if (tag === 'br') return [new TextRun('\n')]
    const nextStyle: InlineStyle = { ...style }
    if (tag === 'strong' || tag === 'b') nextStyle.bold = true
    if (tag === 'em' || tag === 'i') nextStyle.italics = true
    if (tag === 'del' || tag === 's') nextStyle.strike = true
    if (tag === 'sup') nextStyle.superScript = true
    if (tag === 'sub') nextStyle.subScript = true
    if (tag === 'code' || tag === 'kbd') { nextStyle.font = 'Consolas'; nextStyle.shading = { type: ShadingType.CLEAR, fill: 'F1F5F9' } }
    if (tag === 'mark') nextStyle.shading = { type: ShadingType.CLEAR, fill: 'FDE68A' }
    const children = Array.from(node.childNodes).flatMap(child => visit(child, nextStyle))
    if (tag === 'a') {
      const href = getSafeLinkHref(node.getAttribute('href') || '')
      return href ? [new ExternalHyperlink({ link: href, children: children.length ? children : [new TextRun(node.textContent || '')] })] : children
    }
    return children
  }
  return Array.from(parsed.body.firstElementChild?.childNodes || []).flatMap(node => visit(node))
}

function inlineRuns(value: string, formulaImages: Map<string, FormulaImage>): InlineRun[] {
  if (/<\/?[a-z][^>]*>/i.test(value)) {
    const htmlRuns = htmlInlineRuns(value, formulaImages)
    if (htmlRuns.length) return htmlRuns
    const safeText = new DOMParser().parseFromString(sanitizeHtml(value), 'text/html').body.textContent || ''
    return safeText ? [new TextRun(safeText)] : []
  }
  const math = findMathExpressions(value)
  if (math.length) {
    const runs: InlineRun[] = []; let offset = 0
    math.forEach(expression => {
      if (expression.start > offset) runs.push(...inlineRuns(value.slice(offset, expression.start), formulaImages))
      const image = formulaImages.get(formulaKey(expression.latex, expression.display))
      if (image) {
        const { width, height } = wordImageSize(image, expression.display)
        runs.push(new ImageRun({ type: 'png', data: image.data, transformation: { width, height }, altText: { title: '数学公式', description: expression.latex, name: 'Math formula' } }))
      } else runs.push(new TextRun(expression.latex))
      offset = expression.end
    })
    if (offset < value.length) runs.push(...inlineRuns(value.slice(offset), formulaImages))
    return runs
  }
  const pattern = /==([^=\n]+)==|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|\[([^\]]+)\]\(([^)\n]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/; const runs: InlineRun[] = []; let offset = 0
  while (offset < value.length) { const match = pattern.exec(value.slice(offset)); if (!match) { if (value.slice(offset)) runs.push(new TextRun(value.slice(offset))); break }; const start = offset + match.index; if (start > offset) runs.push(new TextRun(value.slice(offset, start))); if (match[1]) runs.push(new TextRun({ text: match[1], shading: { type: ShadingType.CLEAR, fill: 'FDE68A' } })); else if (match[2] || match[3]) runs.push(new TextRun({ text: match[2] || match[3], bold: true })); else if (match[4]) runs.push(new TextRun({ text: match[4], strike: true })); else if (match[5]) runs.push(new TextRun({ text: match[5], font: 'Consolas', shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' } })); else if (match[6] && match[7]) { const href = getSafeLinkHref(match[7]); runs.push(href ? new ExternalHyperlink({ link: href, children: [new TextRun({ text: match[6], color: '0369A1', underline: {} })] }) : new TextRun(match[6])) } else if (match[8] || match[9]) runs.push(new TextRun({ text: match[8] || match[9], italics: true })); offset = start + match[0].length }
  return runs
}

function formulaRun(latex: string, display: boolean, formulaImages: Map<string, FormulaImage>): ImageRun | TextRun {
  const image = formulaImages.get(formulaKey(latex, display))
  if (!image) return new TextRun(display ? `$$${latex}$$` : `$${latex}$`)
  const { width, height } = wordImageSize(image, display)
  return new ImageRun({ type: 'png', data: image.data, transformation: { width, height }, altText: { title: '数学公式', description: latex, name: 'Math formula' } })
}

function readBlockFormula(lines: string[], start: number): { latex: string; end: number } | null {
  const opening = lines[start].trim().match(/^(\$\$|\\\[)(.*)$/)
  if (!opening) return null
  const closing = opening[1] === '$$' ? '$$' : '\\]'
  const parts: string[] = []
  if (opening[2].endsWith(closing)) return { latex: opening[2].slice(0, -closing.length).trim(), end: start }
  if (opening[2]) parts.push(opening[2])
  let index = start + 1
  while (index < lines.length && !lines[index].trim().endsWith(closing)) {
    parts.push(lines[index])
    index += 1
  }
  if (index >= lines.length) return null
  parts.push(lines[index].trim().slice(0, -closing.length))
  return { latex: parts.join('\n').trim(), end: index }
}

function htmlTableToDocx(value: string, formulaImages: Map<string, FormulaImage>): Table | null {
  const safe = sanitizeHtml(value)
  const table = new DOMParser().parseFromString(safe, 'text/html').querySelector('table')
  if (!table) return null
  const rows = Array.from(table.querySelectorAll('tr')).map(row => Array.from(row.querySelectorAll('th,td')))
  if (!rows.length) return null
  const columns = Math.max(1, ...rows.map(row => row.length))
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' }
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: Array(columns).fill(Math.floor(9360 / columns)),
    rows: rows.map((row, rowIndex) => new TableRow({
      children: Array.from({ length: columns }, (_, cellIndex) => {
        const cell = row[cellIndex]
        return new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: 'E0F2FE' } : undefined,
          children: [new Paragraph({ children: inlineRuns(cell?.innerHTML || '', formulaImages) })]
        })
      })
    }))
  })
}

function parseMarkdownToDocx(markdown: string, formulaImages: Map<string, FormulaImage>): Array<Paragraph | Table> {
  const lines = markdown.split('\n'); const blocks: Array<Paragraph | Table> = []; let listType: 'number' | 'bullet' | null = null; let listItems: Array<{ text: string; checked?: boolean }> = []; let inCode = false; let codeLines: string[] = []
  const flushList = () => { if (!listType) return; listItems.forEach(item => blocks.push(new Paragraph({ numbering: item.checked === undefined ? { reference: listType === 'number' ? 'numbers' : 'bullets', level: 0 } : undefined, children: item.checked === undefined ? inlineRuns(item.text, formulaImages) : [new TextRun(item.checked ? '☑ ' : '☐ '), ...inlineRuns(item.text, formulaImages)] }))); listItems = []; listType = null }
  const flushCode = () => { if (!inCode) return; blocks.push(new Paragraph({ children: [new TextRun({ text: codeLines.join('\n'), font: 'Consolas', shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' } })] })); codeLines = []; inCode = false }
  for (let index = 0; index < lines.length; index += 1) { const line = lines[index]; if (/^\s*(?:`{3,}|~{3,})/.test(line)) { flushList(); if (inCode) flushCode(); else inCode = true; continue } if (inCode) { codeLines.push(line); continue } const blockFormula = readBlockFormula(lines, index); if (blockFormula) { flushList(); blocks.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 180 }, children: [formulaRun(blockFormula.latex, true, formulaImages)] })); index = blockFormula.end; continue } if (/^\s*<table\b/i.test(line)) { flushList(); const htmlLines = [line]; while (index + 1 < lines.length && !/<\/table\s*>/i.test(htmlLines.join('\n'))) { index += 1; htmlLines.push(lines[index]) } const htmlTable = htmlTableToDocx(htmlLines.join('\n'), formulaImages); if (htmlTable) blocks.push(htmlTable); continue } if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) { flushList(); const headers = splitTableRow(line); const rows: string[][] = []; index += 2; while (index < lines.length && lines[index].trim() && lines[index].includes('|')) { rows.push(splitTableRow(lines[index])); index += 1 } index -= 1; const columns = Math.max(headers.length, ...rows.map(row => row.length)); const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' }; blocks.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: Array(columns).fill(Math.floor(9360 / columns)), rows: [headers, ...rows].map((row, rowIndex) => new TableRow({ children: Array.from({ length: columns }, (_, cellIndex) => new TableCell({ borders: { top: border, bottom: border, left: border, right: border }, shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: 'E0F2FE' } : undefined, children: [new Paragraph({ children: inlineRuns(row[cellIndex] || '', formulaImages) })] })) })) })); continue } const heading = line.match(/^(#{1,4})\s+(.+)$/); if (heading) { flushList(); const level = heading[1].length; blocks.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][level - 1], children: inlineRuns(heading[2], formulaImages) })); continue } const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/); const ordered = line.match(/^\s*\d+[.)、]\s+(.+)$/); const unordered = line.match(/^\s*[-*+•]\s+(.+)$/); if (task || ordered || unordered) { const nextType = ordered ? 'number' : 'bullet'; if (listType && listType !== nextType) flushList(); listType = nextType; listItems.push(task ? { text: task[2], checked: task[1].toLowerCase() === 'x' } : { text: (ordered || unordered)?.[1] || '' }); continue } flushList(); if (/^\s*>\s?/.test(line)) { blocks.push(new Paragraph({ children: [new TextRun({ text: line.replace(/^\s*>\s?/, ''), italics: true, color: '475569' })] })); continue } if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' } } })); continue } if (line.trim()) blocks.push(new Paragraph({ children: inlineRuns(line, formulaImages) })) }
  flushList(); flushCode(); return blocks
}

/** Kept as a small compatibility helper for callers/tests; downloads now use OOXML. */
export function markdownToWordHtml(markdown: string): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (value: string) => escape(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1<em>$2</em>')
  const lines = markdown.split('\n'); const body: string[] = []; let list: 'ol' | 'ul' | null = null; const items: string[] = []
  const flush = () => { if (list && items.length) body.push(`<${list}>${items.join('')}</${list}>`); list = null; items.length = 0 }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const heading = line.match(/^(#{1,4})\s+(.+)$/); if (heading) { flush(); body.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue }
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/); const ordered = line.match(/^\s*\d+[.)、]\s+(.+)$/); const unordered = line.match(/^\s*[-*•]\s+(.+)$/)
    if (task || ordered || unordered) { const next = ordered ? 'ol' : 'ul'; if (list && list !== next) flush(); list = next; items.push(task ? `<li class="task">${task[1].toLowerCase() === 'x' ? '&#9745;' : '&#9744;'} ${inline(task[2])}</li>` : `<li>${inline((ordered || unordered)?.[1] || '')}</li>`); continue }
    flush(); if (/^\s*>\s?/.test(line)) { body.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`); continue }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { body.push('<hr>'); continue }
    if (line.trim()) body.push(`<p>${inline(line)}</p>`)
  }
  flush(); return body.join('')
}

export async function downloadMarkdownAsWord(markdown: string, fileName = 'ai-reply.docx'): Promise<void> { const formulaImages = await renderFormulaImageMap(markdown); const document = new Document({ creator: 'Feynman Reader', title: 'AI Reply', description: 'Feynman Reader AI response', numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT }] }, { reference: 'numbers', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }] }] }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: parseMarkdownToDocx(markdown, formulaImages) }] }); const blob = await Packer.toBlob(document); const zip = await JSZip.loadAsync(blob); const settings = zip.file('word/settings.xml'); if (settings) { const xml = await settings.async('string'); const updated = xml.includes('<w:view') ? xml.replace(/<w:view[^>]*\/>/, '<w:view w:val="print"/>') : xml.replace('</w:settings>', '<w:view w:val="print"/><w:zoom w:percent="100"/></w:settings>'); zip.file('word/settings.xml', updated) } const output = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); triggerDownload(output, safeFileName(fileName.replace(/\.doc$/i, '.docx'), 'ai-reply.docx')) }
