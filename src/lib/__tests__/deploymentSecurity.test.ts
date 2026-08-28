/** @jest-environment node */

import { readFileSync } from 'fs'
import { join } from 'path'

describe('production security header deployment', () => {
  const securityConfig = readFileSync(join(process.cwd(), '00-feynman-security-headers.conf'), 'utf8')
  const deployScript = readFileSync(join(process.cwd(), 'deploy.sh'), 'utf8')
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  const secretScanWorkflow = readFileSync(join(process.cwd(), '.github/workflows/secret-scan.yml'), 'utf8')
  const safelineDoc = readFileSync(join(process.cwd(), 'docs/operations/safeline-rollout.md'), 'utf8')
  const safelineVerifier = readFileSync(join(process.cwd(), 'scripts/verify-safeline-rollout.sh'), 'utf8')
  const productNginx = readFileSync(join(process.cwd(), 'reader.deline.top.conf'), 'utf8')
  const tokendanceSource = readFileSync(join(process.cwd(), 'src/lib/tokendance.ts'), 'utf8')
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
    expect(deployScript).toContain('https://reader.deline.top/')
    expect(deployScript).toContain('/etc/nginx/conf.d/reader.deline.top.conf')
    expect(securityConfig).toContain('reader.deline.top 1;')
    expect(securityConfig).not.toContain('www.deline.top 1;')
    for (const header of requiredHeaders) {
      expect(deployScript).toContain(`"${header}"`)
    }
    expect(deployScript).toContain('停用入口')
    expect(safelineVerifier).toContain('停用入口')
  })

  it('publishes immutable releases without deleting chunks used by open pages', () => {
    expect(deployScript).toContain('RELEASES_DIR=')
    expect(deployScript).toContain('mv -Tf "$NEXT_LINK" "$WEB_ROOT"')
    expect(deployScript).toContain('rsync -a "$WEB_ROOT/_next/static/"')
    expect(deployScript).toContain('OLD_CHUNK_URL')
    expect(deployScript).toContain('rollback_on_error')
    expect(deployScript).not.toContain('rsync -a --delete')
  })

  it('retires old product aliases before they can reach configuration screens', () => {
    expect(productNginx).toContain('location = /reader { return 410; }')
    expect(productNginx).toContain('location ^~ /reader/ { return 410; }')
    expect(productNginx).toContain('location = /feynmanreader { return 410; }')
    expect(productNginx).toContain('location ^~ /feynmanreader/ { return 410; }')
    expect(tokendanceSource).toContain("TOKENDANCE_APP_URL = 'https://deline.top'")
    expect(tokendanceSource).toContain("TOKENDANCE_CALLBACK_ORIGIN = 'https://reader.deline.top'")
    expect(tokendanceSource).toContain('TOKENDANCE_CALLBACK_ORIGIN}${APP_ROUTES.home}')
    expect(tokendanceSource).not.toContain('window.location.origin}${APP_ROUTES.home}')
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

  it('documents and verifies a low-false-positive SafeLine rollout', () => {
    expect(safelineDoc).toContain('不启用人机验证、身份认证、HTML/JavaScript 动态防护')
    expect(safelineDoc).toContain('api.deepseek.com')
    expect(safelineDoc).toContain('观察至少一个完整高峰周期')
    expect(safelineVerifier).toContain('费曼读书助手')
    for (const header of requiredHeaders) {
      expect(safelineVerifier).toContain(header)
    }
    expect(safelineVerifier).toContain('POST')
    expect(safelineVerifier).toContain('/.env')
  })
})
