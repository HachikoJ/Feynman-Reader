import { assistantSourceId, type AssistantSource, type AssistantSourceTarget } from './assistantSources'

const SOURCE_LABELS: Record<AssistantSourceTarget['kind'], string> = {
  book: '书籍',
  original: '原文',
  note: '笔记',
  bookmark: '书签',
  phase: '阶段学习',
  practice: '费曼实践',
  question: '角色问答',
  recommendation: '相关推荐'
}

export function createSelectionSource(
  target: AssistantSourceTarget,
  title: string,
  excerpt?: string
): AssistantSource {
  return {
    id: assistantSourceId(target),
    ...target,
    label: SOURCE_LABELS[target.kind],
    title: title.trim() || SOURCE_LABELS[target.kind],
    ...(excerpt?.trim() ? { excerpt: excerpt.replace(/\s+/g, ' ').trim().slice(0, 220) } : {})
  }
}
