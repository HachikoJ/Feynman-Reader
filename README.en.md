# Feynman Reader

<p align="center">
  <img src="assets/brand/feynman-reader-logo.png" alt="Feynman Reader logo" width="144">
</p>

![Next.js](https://img.shields.io/badge/Next.js-16-111111)
![DeepSeek](https://img.shields.io/badge/DeepSeek-AI-3b82f6)
![Local-first](https://img.shields.io/badge/data-local--first-22c55e)

[Live demo](https://www.deline.top) · [中文 README](README.md) · [Issues](https://github.com/HachikoJ/Feynman-Reader/issues)

**Reading is not understanding until you can explain it.**

Feynman Reader is an AI-assisted deep-reading workspace based on the Feynman technique. Instead of returning a passive summary, it asks you to teach the book in your own words, evaluates the explanation, and follows up from three different perspectives.

## What It Does

- Starts with a complete, no-setup sample workspace for *The Kite Runner*.
- Guides each book through six sequential learning phases.
- Stores teaching attempts, four-dimension scores, role-based questions, and revisions.
- Supports PDF, Word, Excel, and text document input.
- Works local-first with IndexedDB; books, notes, and settings stay in the browser by default.
- Recommends TokenDance / TokenPay OAuth or API key setup for model access. DeepSeek's direct configuration channel is scheduled to retire on October 1, 2026; existing direct keys will no longer be supported after that date.

## Preview

<p><img src="docs/product/screenshots/01-bookshelf-desktop.png" alt="Feynman Reader desktop bookshelf with The Kite Runner sample" width="100%"></p>
<p><img src="docs/product/screenshots/02-bookshelf-mobile.png" alt="Feynman Reader mobile bookshelf" width="420"></p>

## Quick Start

Requirements: Node.js 20 and npm.

```bash
npm ci
npm run dev
```

Open <http://localhost:8080>. You can inspect the sample book without an API key. To call AI, open Settings, configure TokenDance / TokenPay, read the privacy policy to the end, and confirm AI data transfer consent.

## Privacy, Cost, and Model Limits

The app does not provide cloud storage, sync, or recovery. Clearing browser data can delete learning records, so export backups when prompted. API keys are kept locally and should never be shared in issues, screenshots, or logs.

According to TokenDance's official clarification, `v4flash0731` can be up to about 20% cheaper when peak-hour requests use the Volcengine Ark route. The offer is not guaranteed when smart routing selects DeepSeek official, Alibaba, Baidu, or another port; users can set route preferences in the TokenDance interface. Actual prices, eligible periods, and campaign end dates follow [TokenDance live pricing](https://tokendance.space/models/deepseek-v4-flash-0731) and later notices, and are not promised to be permanent or long-term. Model charges vary with input size and usage. AI analysis, scores, and suggestions are learning aids and are not guaranteed to be factually correct; verify important claims against the original book and your own judgment.

## Development Checks

```bash
npx tsc --noEmit
npm test -- --runInBand
npm run build
npm audit --omit=dev --audit-level=high
git diff --check
```

## Documentation

- [Product materials](docs/product/submission/README.md)
- [Privacy policy](https://www.deline.top/privacy)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Project Status

This is an actively maintained personal project becoming a public product. Voice input, OCR, cloud sync, and automated review scheduling are not part of the current release.

## Latest Update

### August 27, 2026

- Added a one-time TokenDance partner introduction covering OAuth, account services, smart routing, and the conditions for up to about 20% peak-hour savings on the Volcengine Ark route.
- The introduction stays dismissed after entry, while configured users only see a lightweight partner connection status.
- TokenDance OAuth callbacks now open Settings without welcome or onboarding interruptions.

## License

[MIT License](LICENSE)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=HachikoJ/Feynman-Reader&type=Date)](https://star-history.com/#HachikoJ/Feynman-Reader&Date)

## Contact

- GitHub: [HachikoJ](https://github.com/HachikoJ)
- Email: 946106011@qq.com
