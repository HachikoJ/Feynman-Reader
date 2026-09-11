'use client'

import type { HighlightColor } from '@/lib/store'
import { HIGHLIGHT_COLORS } from '@/lib/readerAnnotations'

/** 划线颜色圆点，阅读器与笔记页共用同一套取值。 */
export const HIGHLIGHT_DOT_CLASSES: Record<HighlightColor, string> = {
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  pink: 'bg-pink-500'
}

export const COLOR_LABELS: Record<'zh' | 'en', Record<HighlightColor, string>> = {
  zh: { yellow: '黄色', green: '绿色', blue: '蓝色', pink: '粉色' },
  en: { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' }
}

export function colorLabel(color: HighlightColor, zh: boolean): string {
  return COLOR_LABELS[zh ? 'zh' : 'en'][color]
}

export default function HighlightColorPicker({
  value,
  onChange,
  zh,
  disabled = false
}: {
  value: HighlightColor
  onChange: (color: HighlightColor) => void
  zh: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={zh ? '划线颜色' : 'Highlight color'}>
      {HIGHLIGHT_COLORS.map(color => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color)}
          aria-label={colorLabel(color, zh)}
          aria-pressed={value === color}
          className={`h-6 w-6 rounded-full border border-black/10 transition dark:border-white/20 ${HIGHLIGHT_DOT_CLASSES[color]} ${
            value === color ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-transparent' : 'opacity-70 hover:opacity-100'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        />
      ))}
    </div>
  )
}
