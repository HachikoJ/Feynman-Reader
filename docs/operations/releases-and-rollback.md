# 版本发布与恢复

`v0.2.0` 是首个正式标签版本。此前开发记录保留在 Git 历史中，没有经过同等验收的旧版本标签。后续功能更新递增次版本号，兼容修复递增补丁号；有兼容性变化时在 Release 单独说明。

## 一个版本的组成

- `package.json` 与 `package-lock.json` 使用相同版本号。
- GitHub Release 对应带注释的 `vX.Y.Z` 标签及完整提交 SHA。已发布标签不移动、不覆盖；修复以新版本发布。
- Release 附带 `feynman-reader-vX.Y.Z.tar.gz`、`SHA256SUMS` 和 `release-manifest.json`，保存源码、校验值及提交映射。源码包不含 `.env`、数据库、API Key、认证器密钥或用户数据。
- `deploy.sh` 的发布目录包含版本号及提交号，并在目录根部写入 `release.json`，记录版本、提交、工作区是否修改、部署时间和发布目录名。这是服务器本地文件，不放入 `public/`。
- 无 Git 的源码包部署必须在校验文件及提交后传入 `FEYNMAN_READER_SOURCE_REV`；不传则提交号为 `null`，不能把它当成可验证的正式版本。

服务器最近五个发布目录用于快速回退，不是长期版本仓库。长期恢复依赖 Git 标签、源码包以及另外保管的数据库与服务器配置备份。

## 发布流程

1. 在当前工作区确认本次差异、凭据扫描、版本号、CHANGELOG 和中英文 README；不混入未授权的变更。
2. 使用锁文件安装依赖，完成 TypeScript、ESLint、单元测试、生产构建、生产依赖审计及 `git diff --check`。界面更新检查实际手机和桌面页面。
3. 提交代码并推送，等待该提交的 CI 和 Secret scan 全部通过。
4. 创建对应版本的带注释标签并推送，发布 Release、源码包、SHA-256 和清单；核对 GitHub 标签、清单与本地提交一致。
5. 需要部署时，从已核验的标签创建独立源码目录。保存旧发布路径、当前环境文件、两份 Nginx 配置和数据库备份；记录备份时间及对应版本。备份文件限制为运维账号可读，不能上传公开 Release。
6. 部署后读取 `release.json`，检查健康接口、首页、登录入口、权限拒绝和此次受影响功能。失败时保留日志并恢复原发布；不以构建成功代替线上验收。

## 获取指定版本

优先使用独立检出目录，不对正在使用的工作区执行 `reset --hard` 或强制切分支：

```bash
git clone --branch v0.2.0 --single-branch https://github.com/HachikoJ/Feynman-Reader.git feynman-reader-v0.2.0
cd feynman-reader-v0.2.0
git rev-parse HEAD
git status --porcelain
npm ci
npm run build
```

`HEAD` 必须与该 Release 的 `release-manifest.json` 一致，工作区应无源码修改。GitHub 自动生成的 Source code 包和手动附带的 tar.gz 内容等价，但归档前缀和压缩字节可能不同；`SHA256SUMS` 仅用于同一 Release 的附件。

也可以下载附件并检查完整性：

```bash
gh release download v0.2.0 --repo HachikoJ/Feynman-Reader --dir release-v0.2.0
cd release-v0.2.0
sha256sum -c SHA256SUMS
tar -xzf feynman-reader-v0.2.0.tar.gz
```

macOS 使用 `shasum -a 256 -c SHA256SUMS`。校验值证明下载完整性，不替代仓库来源信任。

## 应用恢复

先确定目标版本、当前版本、数据库兼容性、需要恢复的配置以及恢复失败时的返回路径，再执行切换。不能只靠版本号推断数据库兼容。

- 原发布目录仍保留：使用已核验的该版本 Nginx 配置和环境设置，原子切换站点链接，重新创建 PM2 进程以重新加载环境，然后校验 Nginx 和健康接口。这类恢复不应重新运行数据库迁移。
- 原发布目录已清理：从目标标签重新构建。只有确认该版本迁移脚本与当前数据库兼容、并已完成备份后，才运行完整 `deploy.sh`。它会执行迁移，并不只是替换前端文件。
- 若使用无 Git 的 Release 源码包，传入清单中的完整 SHA；不要把旧环境中遗留的提交号用于新源码。
- `/etc/feynman-reader.env`、TLS 私钥、加密密钥、TOTP 配置和 PostgreSQL 数据不由 Git 恢复。旧代码不一定适用于当前密钥及 OAuth 配置。
- 回退后验证已有账号、书籍详情、已生成分析和管理员拒绝边界；不要以恢复代码为由导入旧数据库或清空浏览器数据。

`deploy.sh` 的自动失败回退恢复发布目录及 Nginx；不会撤销数据库迁移，也不会还原部署前手动修改过的环境文件。回退涉及账号数据、数据库或认证配置时，必须另行确定影响、备份和操作范围。

## v0.2.0 升级注意

- 新增 `013_admin_data_changes.sql` 保存管理员操作的加密存档。仅回退应用时保留此表、审计和上线后产生的数据，不执行删表或旧库覆盖。
- 将已绑定管理员的 UUID 和观猹主体写入服务器 `FEYNMAN_ADMIN_USER_ID`、`FEYNMAN_ADMIN_PROVIDER_SUBJECT`。两项必须与现有账号及有效 `super_admin` 角色一致；不要用昵称推断，更不要重新分配管理员。存在管理员但配置缺失或不一致时部署校验会失败。
- 管理员仍需普通登录与 TOTP。更换环境配置不需要重新生成认证器密钥；已绑定账号应保留原凭据。
- 管理员表单依赖 `/admin` 与 `/api/admin` 的 `same-origin` Referrer-Policy，以及页面的同源 metadata；应用与两份 Nginx 配置应作为一个版本恢复。
- 当前生产使用观猹登录与 TokenDance AI。不要因恢复应用意外重新开放备案期间的密码登录或官方 DeepSeek 渠道。

## Release 0.2.0 / English

This is the first tagged release. Tags are immutable; subsequent fixes receive new versions. Match the package version, annotated Git tag, full commit SHA, source archive, and SHA-256 manifest before deploying.

Recover application code from a separate checkout of the target tag. Git does not restore PostgreSQL, environment files, encryption keys, OAuth credentials, or TOTP enrollment. Retain migration 013 and subsequent user data during application rollback. Before upgrading, configure the existing administrator's UUID and provider subject in `FEYNMAN_ADMIN_USER_ID` and `FEYNMAN_ADMIN_PROVIDER_SUBJECT`; missing or inconsistent bindings deny access and fail deployment validation when an active administrator exists.

The deployment script runs migrations and may rotate old release directories. Its failure rollback restores application and Nginx state, but does not reverse database or environment changes. Assess compatibility and retain private backups before any downgrade.
