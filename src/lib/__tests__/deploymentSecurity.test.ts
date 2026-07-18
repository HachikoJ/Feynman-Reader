/** @jest-environment node */

import { readFileSync } from 'fs'
import { join } from 'path'

describe('production security header deployment', () => {
  const securityConfig = readFileSync(join(process.cwd(), '00-feynman-security-headers.conf'), 'utf8')
  const deployScript = readFileSync(join(process.cwd(), 'deploy.sh'), 'utf8')
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  const secretScanWorkflow = readFileSync(join(process.cwd(), '.github/workflows/secret-scan.yml'), 'utf8')
  const requiredHeaders = [
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
    'Strict-Transport-Security'
  ]

  it('defines every required header at the Nginx http level', () => {
    for (const header of requiredHeaders) {
      expect(securityConfig).toContain(`add_header ${header}`)
    }
    expect(securityConfig).toContain('"1:https" "max-age=31536000; includeSubDomains"')
  })

  it('installs the shared config and verifies the live HTTPS response', () => {
    expect(deployScript).toContain('00-feynman-security-headers.conf')
    expect(deployScript).toContain('https://www.deline.top/')
    for (const header of requiredHeaders) {
      expect(deployScript).toContain(`"${header}"`)
    }
  })

  it('publishes immutable releases without deleting chunks used by open pages', () => {
    expect(deployScript).toContain('RELEASES_DIR=')
    expect(deployScript).toContain('mv -Tf "$NEXT_LINK" "$WEB_ROOT"')
    expect(deployScript).toContain('rsync -a "$WEB_ROOT/_next/static/"')
    expect(deployScript).toContain('OLD_CHUNK_URL')
    expect(deployScript).toContain('rollback_on_error')
    expect(deployScript).not.toContain('rsync -a --delete')
  })

  it('removes Finder metadata after every static build', () => {
    expect(packageJson.scripts.postbuild).toBe('node scripts/sanitize-static-export.mjs')
    const sanitizer = readFileSync(join(process.cwd(), 'scripts/sanitize-static-export.mjs'), 'utf8')
    expect(sanitizer).toContain("entry.name === '.DS_Store'")
    expect(secretScanWorkflow).toContain("find out -type f -name '.DS_Store'")
    expect(secretScanWorkflow).toContain("git ls-files | grep -E '(^|/)\\.DS_Store$'")
  })

  it('rejects retired browser-side activation logic in the published source', () => {
    expect(secretScanWorkflow).toContain('git grep -nE "$forbidden" -- src')
    expect(secretScanWorkflow).not.toContain('git rev-list --all')
  })
})
