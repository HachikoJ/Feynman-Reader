#!/usr/bin/env bash
set -Eeuo pipefail

# Migrate the public application data from the configured PostgreSQL source to
# a PostgreSQL instance on the same server. Secrets are read from the server's
# environment file and are never printed.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${FEYNMAN_READER_ENV_FILE:-/etc/feynman-reader.env}"
WEB_ROOT="${FEYNMAN_READER_WEB_ROOT:-/var/www/feynman-reader}"
BACKUP_ROOT="${FEYNMAN_READER_DB_BACKUP_ROOT:-/var/backups/feynman-reader}"
TARGET_DB="${FEYNMAN_READER_TARGET_DB:-feynman_reader}"
TARGET_ROLE="${FEYNMAN_READER_TARGET_ROLE:-feynman_app}"
TARGET_HOST="127.0.0.1"
TARGET_PORT="5432"
MIN_FREE_KB=$((8 * 1024 * 1024))

SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"
DB_PASSWORD=""
NEW_DATABASE_URL=""
PM2_BIN=""
ENV_BACKUP=""
ENV_SWITCHED=0
APP_STOPPED=0

die() { printf '迁移失败：%s\n' "$*" >&2; exit 1; }
log() { printf '[feynman-postgres] %s\n' "$*"; }

[[ "$(id -u)" == 0 ]] || die '请以 root 执行。'
[[ -r "$ENV_FILE" ]] || die "环境文件不可读：$ENV_FILE"

if [[ -z "$SOURCE_DATABASE_URL" ]]; then
  # The file is an administrator-owned shell-style env file created for this
  # application. It is sourced only on the server and its values are not logged.
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  SOURCE_DATABASE_URL="${DATABASE_URL:-}"
fi
[[ -n "$SOURCE_DATABASE_URL" ]] || die '没有找到源 DATABASE_URL。可通过 SOURCE_DATABASE_URL 临时传入。'

available_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
[[ "$available_kb" =~ ^[0-9]+$ ]] && (( available_kb >= MIN_FREE_KB )) || die '根分区可用空间少于 8GB，先清理或扩容。'

find_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return
  fi
  if command -v systemctl >/dev/null 2>&1; then
    local system_pm2
    system_pm2="$(systemctl show pm2-root.service -p ExecStart --value 2>/dev/null \
      | sed -nE 's/.*=([^[:space:]]*pm2)( .*)?$/\1/p' | head -n1)"
    if [[ -x "$system_pm2" ]]; then
      printf '%s\n' "$system_pm2"
      return
    fi
  fi
  find /root/.nvm/versions/node /usr/local /root/.local -type f \
    \( -path '*/bin/pm2' -o -path '*/node_modules/.bin/pm2' \) \
    -perm -111 2>/dev/null | sort -V | tail -1
}

PM2_BIN="$(find_pm2 || true)"
[[ -n "$PM2_BIN" ]] || die '没有找到 PM2。请先确认 feynman-reader 的实际进程管理方式，不要安装第二套 PM2。'
"$PM2_BIN" describe feynman-reader >/dev/null 2>&1 || die 'PM2 中没有 feynman-reader，已停止迁移以避免误停其他服务。'

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  log '安装 PostgreSQL 客户端和服务端。'
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib postgresql-client
fi

systemctl enable --now postgresql

# Ensure PostgreSQL is local-only. ALTER SYSTEM is cluster-wide and avoids
# guessing a version-specific configuration file path.
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "alter system set listen_addresses = '127.0.0.1';" >/dev/null
systemctl restart postgresql

if sudo -u postgres psql -Atqc "select 1 from pg_database where datname = '$TARGET_DB'" | grep -q 1; then
  die "目标数据库 $TARGET_DB 已存在；为避免覆盖数据，请先人工确认并清理后重试。"
fi

DB_PASSWORD="$(openssl rand -hex 32)"
NEW_DATABASE_URL="postgresql://${TARGET_ROLE}:${DB_PASSWORD}@${TARGET_HOST}:${TARGET_PORT}/${TARGET_DB}"
BACKUP_ID="$(date -u +%Y%m%d%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
install -d -m 700 "$BACKUP_DIR"

rollback() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    log '检测到失败，保留备份和目标数据库以便人工检查。'
    if (( ENV_SWITCHED == 1 )) && [[ -n "$ENV_BACKUP" && -f "$ENV_BACKUP" ]]; then
      install -m 600 "$ENV_BACKUP" "$ENV_FILE"
      log '已恢复旧环境文件。'
    fi
    if (( APP_STOPPED == 1 )); then
      FEYNMAN_READER_WEB_ROOT="$WEB_ROOT" "$PM2_BIN" startOrReload "$PROJECT_DIR/ecosystem.config.cjs" --update-env >/dev/null 2>&1 || true
      log '已尝试恢复 feynman-reader。'
    fi
  fi
  exit "$status"
}
trap rollback EXIT

log '检查源数据库连接和版本。'
psql "$SOURCE_DATABASE_URL" -Atqc "select current_database(), current_setting('server_version')" >/dev/null
pg_dump --version >/dev/null

log '导出迁移前完整备份。'
pg_dump "$SOURCE_DATABASE_URL" --format=custom --schema=public --no-owner --no-privileges --file="$BACKUP_DIR/supabase-public-before.dump"
sha256sum "$BACKUP_DIR/supabase-public-before.dump" > "$BACKUP_DIR/SHA256SUMS"

log '创建本地数据库和最小权限应用账号。'
sudo -u postgres psql -v ON_ERROR_STOP=1 --set=app_password="$DB_PASSWORD" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$TARGET_ROLE') THEN
    CREATE ROLE $TARGET_ROLE LOGIN;
  END IF;
END
\$\$;
ALTER ROLE $TARGET_ROLE WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
SQL
sudo -u postgres createdb --owner="$TARGET_ROLE" "$TARGET_DB"

log '执行仓库内 001～006、008 迁移，跳过需要 Supabase pg_cron 的 007。'
for migration in "$PROJECT_DIR"/supabase/migrations/00[1-6]_*.sql "$PROJECT_DIR"/supabase/migrations/008_password_auth.sql; do
  sudo -u postgres psql -v ON_ERROR_STOP=1 --dbname="$TARGET_DB" --file="$migration" >/dev/null
done

log '停止 feynman-reader，进入维护窗口。'
"$PM2_BIN" stop feynman-reader >/dev/null
APP_STOPPED=1

log '导出停写后的最终数据。'
pg_dump "$SOURCE_DATABASE_URL" --format=custom --data-only --schema=public --no-owner --no-privileges --file="$BACKUP_DIR/supabase-public-data-final.dump"
sha256sum "$BACKUP_DIR/supabase-public-data-final.dump" >> "$BACKUP_DIR/SHA256SUMS"

log '恢复最终数据到本地 PostgreSQL。'
sudo -u postgres pg_restore --data-only --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DB" "$BACKUP_DIR/supabase-public-data-final.dump"

log '在最终数据恢复后执行用户资料字段和账号合并迁移。'
sudo -u postgres psql -v ON_ERROR_STOP=1 --dbname="$TARGET_DB" --file="$PROJECT_DIR/supabase/migrations/009_profile_columns.sql" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 --dbname="$TARGET_DB" --file="$PROJECT_DIR/supabase/migrations/010_account_merge.sql" >/dev/null

sudo -u postgres psql -v ON_ERROR_STOP=1 --dbname="$TARGET_DB" <<SQL
GRANT CONNECT ON DATABASE $TARGET_DB TO $TARGET_ROLE;
GRANT USAGE ON SCHEMA public TO $TARGET_ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $TARGET_ROLE;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $TARGET_ROLE;
SQL

log '验证应用账号可以连接并读写目标 schema。'
psql "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from public.app_users" >/dev/null

log '校验核心表行数，只输出数量。'
TABLES=(app_users auth_sessions api_key_records user_settings user_books user_ai_usage user_book_lists user_book_relations user_data_state user_aux_data user_assistant_sessions user_assistant_memories user_behavior_events)
for table in "${TABLES[@]}"; do
  old_count="$(psql "$SOURCE_DATABASE_URL" -Atqc "select count(*) from public.$table")"
  new_count="$(sudo -u postgres psql -Atqc "select count(*) from public.$table" --dbname="$TARGET_DB")"
  printf '%s old=%s new=%s\n' "$table" "$old_count" "$new_count" | tee -a "$BACKUP_DIR/table-counts.txt"
  [[ "$old_count" == "$new_count" ]] || die "表 $table 行数不一致。"
done

ENV_BACKUP="$BACKUP_DIR/feynman-reader.env.before-local-postgres"
install -m 600 "$ENV_FILE" "$ENV_BACKUP"
sed -i -E "s|^DATABASE_URL=.*$|DATABASE_URL=$NEW_DATABASE_URL|" "$ENV_FILE"
if grep -q '^DATABASE_POOL_MAX=' "$ENV_FILE"; then
  sed -i -E 's|^DATABASE_POOL_MAX=.*$|DATABASE_POOL_MAX=5|' "$ENV_FILE"
else
  printf '%s\n' 'DATABASE_POOL_MAX=5' >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
ENV_SWITCHED=1

log '启动应用并执行本机健康检查。'
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
APP_STOPPED=1
FEYNMAN_READER_WEB_ROOT="$WEB_ROOT" "$PM2_BIN" startOrReload "$PROJECT_DIR/ecosystem.config.cjs" --update-env >/dev/null
for attempt in {1..10}; do
  if curl -fsS --connect-timeout 3 --max-time 8 http://127.0.0.1:8080/api/health/ | grep -q '"status":"ok"'; then
    break
  fi
  [[ "$attempt" == 10 ]] && die '本机健康检查失败。'
  sleep 2
done

NODE_BIN="$(command -v node || true)"
[[ -x "$NODE_BIN" ]] || NODE_BIN="$(find /root/.nvm/versions/node /usr/local -type f -path '*/bin/node' -perm -111 2>/dev/null | sort -V | tail -1)"
[[ -x "$NODE_BIN" ]] || die '找不到 node，无法写入回收站清理任务。'
install -d -m 755 /var/log
printf '%s\n' "17 3 * * * root cd $PROJECT_DIR && FEYNMAN_READER_ENV_FILE=$ENV_FILE $NODE_BIN --experimental-strip-types scripts/purge-recycle-bin.mjs >> /var/log/feynman-reader-purge.log 2>&1" > /etc/cron.d/feynman-reader-purge
chmod 644 /etc/cron.d/feynman-reader-purge

"$PM2_BIN" save --force >/dev/null 2>&1 || true
log "迁移完成。备份目录：$BACKUP_DIR"
log '旧 Supabase 尚未删除，请至少观察 7 天后再决定是否停用。'
APP_STOPPED=0
ENV_SWITCHED=0
trap - EXIT
