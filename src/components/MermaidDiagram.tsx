'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

export default function MermaidDiagram({ source }: { source: string }) {
  const identifier = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [svg, setSvg] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
    window.setTimeout(() => setCopyState('idle'), 1600)
  }

  useEffect(() => {
    let active = true
    setState('loading')
    setSvg('')
    void (async () => {
      try {
        const mermaidModule = await import('mermaid')
        const mermaid = mermaidModule.default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          flowchart: { htmlLabels: false, useMaxWidth: true }
        })
        const rendered = await mermaid.render(`feynman-mermaid-${identifier}`, source)
        if (!active) return
        setSvg(sanitizeHtml(rendered.svg, true))
        setState('ready')
      } catch {
        if (active) {
          setSvg('')
          setState('error')
        }
      }
    })()

    return () => {
      active = false
    }
  }, [identifier, source])

  return (
    <figure className="markdown-mermaid-wrap" aria-label="Mermaid 图表 / Mermaid diagram">
      <div className="markdown-code-toolbar">
        <span>mermaid</span>
        <button
          type="button"
          className="markdown-code-copy"
          onClick={() => void copySource()}
          aria-label={copyState === 'copied' ? '已复制 Mermaid 源码 / Mermaid source copied' : copyState === 'error' ? '复制 Mermaid 源码失败 / Failed to copy Mermaid source' : '复制 Mermaid 源码 / Copy Mermaid source'}
          title="复制 Mermaid 源码 / Copy Mermaid source"
        >
          {copyState === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copyState === 'copied' ? '已复制 / Copied' : copyState === 'error' ? '失败 / Failed' : '复制 / Copy'}
        </button>
      </div>
      {state === 'loading' && <div className="markdown-mermaid" aria-busy="true"><span className="markdown-mermaid-status">正在绘制图表 / Rendering diagram...</span></div>}
      {state === 'ready' && <div className="markdown-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />}
      {state === 'error' && (
        <div className="markdown-mermaid-fallback">
          <p>图表语法暂时无法渲染，已保留 Mermaid 源码。</p>
          <pre><code>{source}</code></pre>
        </div>
      )}
      {state === 'ready' && (
        <details className="markdown-mermaid-source">
          <summary>查看 Mermaid 源码 / View source</summary>
          <pre><code>{source}</code></pre>
        </details>
      )}
    </figure>
  )
}
