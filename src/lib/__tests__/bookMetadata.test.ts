import { buildMissingBookMetadataUpdates, needsBookMetadataEnrichment } from '../bookMetadata'

const completeMetadata = {
  author: '作者',
  description: '简介',
  tags: [{ name: '主题', category: '社科' }]
}

describe('automatic book metadata enrichment', () => {
  it('only enriches books that are already reading or finished', () => {
    expect(needsBookMetadataEnrichment({ status: 'unread', author: undefined, description: undefined, tags: [] })).toBe(false)
    expect(needsBookMetadataEnrichment({ status: 'reading', author: undefined, description: undefined, tags: [] })).toBe(true)
    expect(needsBookMetadataEnrichment({ status: 'finished', ...completeMetadata })).toBe(false)
  })

  it('fills missing fields without overwriting user-provided metadata', () => {
    const updates = buildMissingBookMetadataUpdates({
      status: 'reading',
      author: '用户填写的作者',
      description: undefined,
      tags: []
    }, completeMetadata)

    expect(updates).toEqual({
      description: '简介',
      tags: [{ name: '主题', category: '社科' }]
    })
  })
})
