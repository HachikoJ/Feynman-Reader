import { getAuthConfig, isPasswordAuthEnabled } from '../authConfig'

describe('authentication transition mode', () => {
  const previous = process.env.FEYNMAN_WATCHA_OAUTH_ENABLED

  afterEach(() => {
    if (previous === undefined) delete process.env.FEYNMAN_WATCHA_OAUTH_ENABLED
    else process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = previous
  })

  it('uses only password accounts during filing review', () => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'false'
    expect(getAuthConfig().enabledProviders).toEqual(['password'])
    expect(isPasswordAuthEnabled()).toBe(true)
  })

  it('uses only Watcha after OAuth is enabled', () => {
    process.env.FEYNMAN_WATCHA_OAUTH_ENABLED = 'true'
    expect(getAuthConfig().enabledProviders).toEqual(['tokendance'])
    expect(isPasswordAuthEnabled()).toBe(false)
  })
})
