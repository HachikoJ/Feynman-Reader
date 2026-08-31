# 本机 PostgreSQL 迁移

Feynman Reader 使用 PostgreSQL 适配器。部署在中国大陆服务器时，可以先把数据库从远程 PostgreSQL 托管服务同构迁移到同一台服务器的本机 PostgreSQL，避免更换数据库类型带来的 JSONB、事务和 SQL 兼容风险。

## 运行方式

在服务器项目目录执行：

```bash
cd /var/www/Feynman-Reader
FEYNMAN_READER_PROJECT_DIR=/var/www/Feynman-Reader \
FEYNMAN_READER_ENV_FILE=/etc/feynman-reader.env \
bash ./scripts/migrate-to-local-postgres.sh
```

脚本会：

- 检查根分区至少有 8GB 可用空间，并确认 PM2 中存在 `feynman-reader`；
- 安装并初始化本机 PostgreSQL，只监听 `127.0.0.1:5432`；
- 导出迁移前完整备份；
- 执行仓库内 `001`～`006` 和 `008_password_auth.sql` 迁移，跳过依赖 Supabase `pg_cron` 的 `007`；
- 停止应用后再次导出最终数据并恢复；
- 校验核心表行数；
- 仅修改服务器环境文件中的 `DATABASE_URL` 和 `DATABASE_POOL_MAX=5`；
- 启动应用、检查 `/api/health/`，并写入回收站每日清理任务。

脚本不会输出连接串、密码或用户数据。备份保存在 `/var/backups/feynman-reader/<UTC 时间>/`，目标数据库若已存在会拒绝执行，避免误覆盖。迁移失败会恢复旧环境文件并尝试重新启动应用，但不会自动删除目标数据库或备份。

## 迁移后的检查

```bash
curl -fsS http://127.0.0.1:8080/api/health/
curl -fsS https://reader.deline.top/api/health/
ss -ltnp | grep ':5432'
```

两个健康检查应返回 `{"status":"ok"}`；5432 应只显示 `127.0.0.1`。迁移后保留原远程数据库至少 7 天，确认登录、账号中心、书架、金句、助手会话、删除/恢复和回收站均正常后，再处理旧数据库停用。
