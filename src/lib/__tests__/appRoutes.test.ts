import { APP_ROUTES, readerHref } from '../appRoutes'

describe('standalone product routes', () => {
  it('keeps the product and website origins explicit', () => {
    expect(APP_ROUTES.home).toBe('/')
    expect(APP_ROUTES.website).toBe('https://www.deline.top/')
  })

  it('builds root links without reintroducing the legacy path', () => {
    expect(readerHref()).toBe('/')
    expect(readerHref('https://reader.feline.top')).toBe('https://reader.feline.top/')
  })
})
