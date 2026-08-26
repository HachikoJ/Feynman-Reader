# 参与贡献

感谢你愿意改进费曼读书助手。项目目前由个人维护，请先搜索现有 Issue，确认问题尚未被报告或讨论。

## 提交问题

- Bug 请使用 Bug report 模板，并附上可复现步骤、预期结果、实际结果和运行环境。
- 功能建议请说明真实使用场景、当前阻碍和期望结果。
- 安全漏洞不要提交公开 Issue，请按 [安全政策](SECURITY.md) 私密报告。
- 请勿在 Issue、日志或截图中提交 API Key、个人学习数据或其他敏感信息。

## 本地开发

需要 Node.js 20 和 npm。

```bash
npm ci
npm run dev
```

访问 [http://localhost:8080](http://localhost:8080)。提交前运行：

```bash
npx tsc --noEmit
npm test -- --runInBand
npm run build
git diff --check
```

## Pull Request

- 一个 PR 只解决一个明确问题，避免无关重构和格式化。
- 为行为变更补充或更新测试，并说明手动验证范围。
- UI 改动请提供桌面端和移动端截图，并检查中英文界面。
- 不要提交真实 API Key、用户数据、构建产物或临时调试文件。
- PR 是否合并由维护者根据项目方向、风险和维护成本决定；提交不代表一定会被接受。

参与本项目即表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)。
