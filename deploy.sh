#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${FEYNMAN_READER_PROJECT_DIR:-$SCRIPT_DIR}"
WEB_ROOT="${FEYNMAN_READER_WEB_ROOT:-/var/www/feynman-reader}"
DEPLOY_ROOT="${FEYNMAN_READER_DEPLOY_ROOT:-/var/www/feynman-reader-deploy}"
RELEASES_DIR="$DEPLOY_ROOT/releases"
NGINX_CONFIG="/etc/nginx/conf.d/reader.deline.top.conf"
NGINX_SECURITY_CONFIG="/etc/nginx/conf.d/00-feynman-security-headers.conf"
RELEASES_TO_KEEP=5
CHUNK_RETENTION_DAYS=14
ENV_FILE="${FEYNMAN_READER_ENV_FILE:-/etc/feynman-reader.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

cd "$PROJECT_DIR"

RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short=12 HEAD)"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
NEXT_LINK="/var/www/.feynman-reader-next-${RELEASE_ID}-$$"
CONFIG_BACKUP_DIR="$DEPLOY_ROOT/config-backup-$RELEASE_ID"
PREVIOUS_RELEASE=""
OLD_CHUNK_URL=""
SWITCHED=0
CONFIGS_INSTALLED=0

reload_application() {
  if [[ -f "$WEB_ROOT/server.js" ]]; then
    FEYNMAN_READER_WEB_ROOT="$WEB_ROOT" pm2 startOrReload "$PROJECT_DIR/ecosystem.config.cjs" --update-env
    pm2 save --force >/dev/null
  else
    pm2 delete feynman-reader 2>/dev/null || true
    pm2 save --force >/dev/null 2>&1 || true
  fi
}

atomic_switch() {
  local target="$1"
  rm -f "$NEXT_LINK"
  ln -s "$target" "$NEXT_LINK"
  mv -Tf "$NEXT_LINK" "$WEB_ROOT"
}

restore_nginx_configs() {
  if [[ -f "$CONFIG_BACKUP_DIR/reader.deline.top.conf" ]]; then
    install -m 644 "$CONFIG_BACKUP_DIR/reader.deline.top.conf" "$NGINX_CONFIG"
  else
    rm -f "$NGINX_CONFIG"
  fi

  if [[ -f "$CONFIG_BACKUP_DIR/00-feynman-security-headers.conf" ]]; then
    install -m 644 "$CONFIG_BACKUP_DIR/00-feynman-security-headers.conf" "$NGINX_SECURITY_CONFIG"
  else
    rm -f "$NGINX_SECURITY_CONFIG"
  fi
}

rollback_on_error() {
  local status=$?
  trap - EXIT
  rm -f "$NEXT_LINK"

  if [[ $status -ne 0 ]]; then
    echo "部署失败，正在恢复上一版本..." >&2
    if [[ -n "$PREVIOUS_RELEASE" && ( $SWITCHED -eq 1 || ! -e "$WEB_ROOT" ) ]]; then
      atomic_switch "$PREVIOUS_RELEASE" || true
    elif [[ $SWITCHED -eq 1 && -L "$WEB_ROOT" ]]; then
      rm -f "$WEB_ROOT"
    fi

    if [[ $CONFIGS_INSTALLED -eq 1 ]]; then
      restore_nginx_configs || true
    fi
    reload_application || true
    /usr/sbin/nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  fi

  exit "$status"
}

trap rollback_on_error EXIT

echo "=========================================="
echo "费曼读书助手原子部署：$RELEASE_ID"
echo "=========================================="

echo "1. 安装锁定依赖..."
npm ci

echo "2. 构建并检查 Next.js 服务端产物..."
NODE_ENV=production npm run build
if [[ ! -f "$PROJECT_DIR/.next/standalone/server.js" ]]; then
  echo "部署失败：没有生成 .next/standalone/server.js" >&2
  exit 1
fi
if find "$PROJECT_DIR/.next" "$PROJECT_DIR/public" -name '.DS_Store' -print -quit | grep -q .; then
  echo "部署失败：服务端产物中仍存在 .DS_Store" >&2
  exit 1
fi

echo "3. 创建不可变发布目录并保留旧 Chunk..."
install -d -m 755 "$RELEASES_DIR" "$CONFIG_BACKUP_DIR"
if [[ -e "$RELEASE_DIR" ]]; then
  echo "部署失败：发布目录已存在 $RELEASE_DIR" >&2
  exit 1
fi
install -d -m 755 "$RELEASE_DIR"

if [[ -d "$WEB_ROOT/.next/static" ]]; then
  old_chunk="$(find "$WEB_ROOT/.next/static" -type f -name '*.js' -mtime "-$CHUNK_RETENTION_DAYS" -print -quit)"
  if [[ -n "$old_chunk" ]]; then
    OLD_CHUNK_URL="/_next/static/${old_chunk#"$WEB_ROOT/.next/static/"}"
  fi
  install -d -m 755 "$RELEASE_DIR/.next/static"
  rsync -a "$WEB_ROOT/.next/static/" "$RELEASE_DIR/.next/static/"
fi

rsync -a "$PROJECT_DIR/.next/standalone/" "$RELEASE_DIR/"
install -d -m 755 "$RELEASE_DIR/.next/static" "$RELEASE_DIR/public"
rsync -a "$PROJECT_DIR/.next/static/" "$RELEASE_DIR/.next/static/"
rsync -a "$PROJECT_DIR/public/" "$RELEASE_DIR/public/"
find "$RELEASE_DIR/.next/static" -type f -mtime "+$CHUNK_RETENTION_DAYS" -delete 2>/dev/null || true
if find "$RELEASE_DIR" -name '.DS_Store' -print -quit | grep -q .; then
  echo "部署失败：发布目录中仍存在 .DS_Store" >&2
  exit 1
fi

echo "4. 原子更新并校验 Nginx 配置..."
[[ -f "$NGINX_CONFIG" ]] && cp -a "$NGINX_CONFIG" "$CONFIG_BACKUP_DIR/reader.deline.top.conf"
[[ -f "$NGINX_SECURITY_CONFIG" ]] && cp -a "$NGINX_SECURITY_CONFIG" "$CONFIG_BACKUP_DIR/00-feynman-security-headers.conf"
install -m 644 "$PROJECT_DIR/00-feynman-security-headers.conf" "$NGINX_SECURITY_CONFIG.new"
install -m 644 "$PROJECT_DIR/reader.deline.top.conf" "$NGINX_CONFIG.new"
mv -f "$NGINX_SECURITY_CONFIG.new" "$NGINX_SECURITY_CONFIG"
mv -f "$NGINX_CONFIG.new" "$NGINX_CONFIG"
CONFIGS_INSTALLED=1
/usr/sbin/nginx -t

echo "5. 原子切换站点目录并启动 Node 服务..."
if [[ -L "$WEB_ROOT" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "$WEB_ROOT")"
elif [[ -d "$WEB_ROOT" ]]; then
  PREVIOUS_RELEASE="$RELEASES_DIR/legacy-$RELEASE_ID"
  mv "$WEB_ROOT" "$PREVIOUS_RELEASE"
elif [[ -e "$WEB_ROOT" ]]; then
  echo "部署失败：$WEB_ROOT 既不是目录也不是符号链接" >&2
  exit 1
fi

atomic_switch "$RELEASE_DIR"
SWITCHED=1
reload_application
curl -fsS --retry 5 --retry-connrefused --retry-delay 2 --connect-timeout 5 --max-time 10 "http://127.0.0.1:8080/api/health/" | grep -q '"status":"ok"'
systemctl reload nginx

echo "6. 验证公网首页、健康检查、新旧 Chunk 与 HTTPS 安全响应头..."
RESPONSE_HEADERS="$(curl -fsSI --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 20 "https://reader.feline.top/?release=$RELEASE_ID")"
REQUIRED_HEADERS=(
  "Content-Security-Policy"
  "X-Frame-Options"
  "X-Content-Type-Options"
  "Referrer-Policy"
  "Permissions-Policy"
  "Cross-Origin-Opener-Policy"
  "Strict-Transport-Security"
)

for header in "${REQUIRED_HEADERS[@]}"; do
  if ! grep -qi "^${header}:" <<< "$RESPONSE_HEADERS"; then
    echo "部署失败：公网 HTTPS 响应缺少 ${header}" >&2
    exit 1
  fi
done

curl -fsS --retry 3 --connect-timeout 10 --max-time 20 "https://reader.feline.top/api/health/" | grep -q '"status":"ok"'

for retired_path in "/reader" "/reader/?view=settings&tokendance_callback=1" "/feynmanreader" "/feynmanreader/settings"; do
  retired_status="$(curl -sS --retry 3 --connect-timeout 10 --max-time 20 -o /dev/null -w '%{http_code}' "https://reader.feline.top$retired_path")"
  if [[ "$retired_status" != "410" ]]; then
    echo "部署失败：停用入口 $retired_path 返回 HTTP $retired_status，而不是 410" >&2
    exit 1
  fi
done

new_chunk="$(find "$PROJECT_DIR/.next/static" -type f -name '*.js' -print -quit)"
if [[ -z "$new_chunk" ]]; then
  echo "部署失败：构建产物中没有可验证的 JavaScript Chunk" >&2
  exit 1
fi
NEW_CHUNK_URL="/_next/static/${new_chunk#"$PROJECT_DIR/.next/static/"}"
curl -fsS --retry 3 --connect-timeout 10 --max-time 20 "https://reader.feline.top$NEW_CHUNK_URL?release=$RELEASE_ID" >/dev/null
if [[ -n "$OLD_CHUNK_URL" ]]; then
  curl -fsS --retry 3 --connect-timeout 10 --max-time 20 "https://reader.feline.top$OLD_CHUNK_URL?release=$RELEASE_ID" >/dev/null
fi

echo "7. 保留最近 $RELEASES_TO_KEEP 个可回滚版本..."
mapfile -t releases < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
for old_release in "${releases[@]:$RELEASES_TO_KEEP}"; do
  [[ "$old_release" == "$RELEASE_DIR" ]] || rm -rf -- "$old_release"
done

rm -rf "$CONFIG_BACKUP_DIR"
SWITCHED=0
CONFIGS_INSTALLED=0
trap - EXIT

echo "=========================================="
echo "部署完成：https://reader.feline.top"
echo "=========================================="
