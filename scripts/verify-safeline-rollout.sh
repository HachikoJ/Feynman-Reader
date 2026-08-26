#!/usr/bin/env bash
set -Eeuo pipefail

# Verify the public path after SafeLine is introduced. This deliberately checks
# user-visible behavior and does not send exploit payloads to production.
BASE_URL="${1:-https://www.deline.top}"
BASE_URL="${BASE_URL%/}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

HEADERS="$WORK_DIR/headers"
BODY="$WORK_DIR/body"

curl_common=(
  --silent
  --show-error
  --connect-timeout 10
  --max-time 30
  --retry 2
  --retry-delay 1
)

fail() {
  echo "SafeLine 发布验证失败：$1" >&2
  exit 1
}

fetch_root() {
  curl "${curl_common[@]}" -D "$HEADERS" -o "$BODY" "$BASE_URL/?waf_smoke_check=1&book=%E4%B9%8C%E5%90%88%E4%B9%8B%E4%BC%97" \
    || fail "首页无法访问"
  grep -q '费曼读书助手' "$BODY" || fail "首页内容不是费曼读书助手，可能返回了 WAF 挑战页或错误页"
}

status_code() {
  curl "${curl_common[@]}" -o /dev/null -w '%{http_code}' "$1"
}

fetch_root

grep -Eiq '^content-security-policy:' "$HEADERS" || fail "缺少 Content-Security-Policy"
grep -Eiq '^x-frame-options:.*deny' "$HEADERS" || fail "缺少 X-Frame-Options"
grep -Eiq '^x-content-type-options:.*nosniff' "$HEADERS" || fail "缺少 X-Content-Type-Options"
grep -Eiq '^referrer-policy:' "$HEADERS" || fail "缺少 Referrer-Policy"
grep -Eiq '^permissions-policy:' "$HEADERS" || fail "缺少 Permissions-Policy"
grep -Eiq '^cross-origin-opener-policy:.*same-origin' "$HEADERS" || fail "缺少 Cross-Origin-Opener-Policy"
grep -Eiq '^strict-transport-security:' "$HEADERS" || fail "缺少 Strict-Transport-Security"

ROOT_STATUS="$(status_code "$BASE_URL/")"
[[ "$ROOT_STATUS" == "200" ]] || fail "首页返回 HTTP $ROOT_STATUS"

CSS_PATH="$(grep -m 1 -oE 'href="/_next/static/css/[^"]+\.css"' "$BODY" | cut -d'"' -f2)"
JS_PATH="$(grep -m 1 -oE 'src="/_next/static/[^" ]+\.js"' "$BODY" | cut -d'"' -f2)"
[[ -n "$CSS_PATH" ]] || fail "首页没有找到 CSS 静态资源"
[[ -n "$JS_PATH" ]] || fail "首页没有找到 JavaScript 静态资源"

[[ "$(status_code "$BASE_URL$CSS_PATH")" == "200" ]] || fail "CSS 静态资源无法访问"
[[ "$(status_code "$BASE_URL$JS_PATH")" == "200" ]] || fail "JavaScript 静态资源无法访问"
[[ "$(status_code "$BASE_URL/sw.js")" == "200" ]] || fail "Service Worker 无法访问"

POST_STATUS="$(curl "${curl_common[@]}" -X POST -o /dev/null -w '%{http_code}' "$BASE_URL/")"
case "$POST_STATUS" in
  2*|3*) fail "首页接受了不应开放的 POST 请求（HTTP $POST_STATUS）" ;;
esac

for blocked_path in "/.env" "/.git/config" "/next.config.js" "/_next/static/unknown.map"; do
  BLOCKED_STATUS="$(status_code "$BASE_URL$blocked_path")"
  case "$BLOCKED_STATUS" in
    2*) fail "敏感路径 $blocked_path 返回了 HTTP $BLOCKED_STATUS" ;;
  esac
done

echo "SafeLine 发布验证通过：$BASE_URL"
echo "已验证首页、用户查询参数、CSP、安全响应头、Next.js 静态资源、Service Worker、非 GET 请求和敏感路径拦截。"
