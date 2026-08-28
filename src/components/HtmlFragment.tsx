'use client'

import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { Download } from 'lucide-react'
import { downloadTableAsExcel } from '@/lib/markdownExport'

export default function HtmlFragment({ html, block = false }: { html: string; block?: boolean }) {
  const safeHtml = sanitizeHtml(html)
  if (!safeHtml.trim()) return null

  if (block && /<table\b/i.test(safeHtml)) {
    const parsed = new DOMParser().parseFromString(safeHtml, 'text/html')
    const table = parsed.querySelector('table')
    if (table) {
      const rows = Array.from(table.querySelectorAll('tr')).map(row => Array.from(row.querySelectorAll('th,td')).map(cell => cell.textContent?.trim() || ''))
      const headers = rows.shift() || []
      return (
        <div className="markdown-table-wrap" role="region" aria-label="HTML 表格 / HTML table" tabIndex={0}>
          <div className="markdown-table-toolbar">
            <span>表格 / Table</span>
            <button type="button" className="markdown-table-download" onClick={() => void downloadTableAsExcel({ headers, rows }, 'feynman-table.xlsx')} aria-label="下载 Excel / Download Excel" title="下载 Excel / Download Excel">
              <Download size={13} aria-hidden="true" />
              <span>Excel</span>
            </button>
          </div>
          <div className="markdown-html-block" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>
      )
    }
  }

  return block ? (
    <div className="markdown-html-block" dangerouslySetInnerHTML={{ __html: safeHtml }} />
  ) : (
    <span className="markdown-html-inline" dangerouslySetInnerHTML={{ __html: safeHtml }} />
  )
}
