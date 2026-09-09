# Changelog

Notable changes to Feynman Reader are recorded here.

## [0.2.2] - 2026-09-09

### Changed

- Align product pages, onboarding, sign-in, Account Center, settings, document upload, assistant guidance, and save errors with the README's focus on personal reading and learning records.
- Replace storage-oriented promotion with account and reading terminology in Chinese and English. Keep actionable save failures and legacy local-history import warnings.
- Clarify existing data handling in the privacy notice, including account-scoped server storage, AI context, credentials, cookies, exports, and deletion. Actual data handling and consent controls are unchanged.
- Refresh Account Center screenshots and retain previous release assets for reference.

No database schema, account permissions, or persistence behavior changed. See [release notes](docs/releases/v0.2.2.md).

## [0.2.1] - 2026-09-09

### Fixed

- Cover replacement and removal, cleared author/description fields, and empty tags persist after navigating or refreshing. Metadata edits preserve server learning details even after the client has opened a full book.
- Cover uploads cancel stale readers, allow selecting the same file again, and block saving while a read is pending or invalid.
- Book lists and relations use authenticated, account-scoped record operations so deletions and membership changes persist without replaying unrelated cached data.
- AI usage appends one idempotent record; ordinary usage tracking no longer imports the entire cached bookshelf and settings. Imports and migration preserve existing account profile fields.
- Cloud refresh waits for pending writes and ignores responses superseded by a local edit. Failed writes cannot be mistaken for successful saves or hidden by another book's success.
- Rejected book timestamps return a visible conflict; stale full-book updates cannot restore a book from the recycle bin.

No database schema change or historical data restoration is included. See [release notes](docs/releases/v0.2.1.md) for validation and recovery scope.

## [0.2.0] - 2026-09-09

First tagged release. Earlier development is preserved in Git history; no earlier tagged release is implied.

### Release Management

- Package version, immutable Git tag, source archive, SHA-256 checksum, and release manifest identify the same source revision.
- Deployments record package version and full source commit in a server-local `release.json`.
- [Version and recovery guide](docs/operations/releases-and-rollback.md) separates application rollback from database and secret recovery.

### Added

- Username/password registration and sign-in as a fallback account channel; email is collected as an unverified account identifier.
- Watcha OAuth account login with persistent server-side sessions.
- PostgreSQL-backed books, settings, quotes, assistant sessions, long-term memories, activity history, and account statistics.
- Account Center with cloud bookshelf, quote management, recycle bin, data transfer, and activity calendar.
- Legacy IndexedDB migration with newer-record conflict resolution and sample-book exclusion.
- Protected system administration with TOTP step-up authentication, independent sessions, an analytics dashboard, and detailed browsing across 19 data tables.
- Audited administrator editing, account disable/enable, deletion, and conflict-aware recovery through encrypted change archives.
- Administrator user identities show avatars, display names, usernames, and UUIDs together.

### Changed

- Personal data now requires sign-in and is stored in the account cloud; IndexedDB remains only as a legacy migration source.
- TokenDance API keys are encrypted server-side and excluded from cloud exports.
- User-created quotes are prioritized over the bundled 101-quote system library.
- Restored Watcha sign-in and TokenDance integration after ICP approval; added the ICP registration footer.
- TokenDance request attribution consistently uses `https://www.deline.top`.
- Review cards use application-theme colors; all TokenDance logos switch to the official dark-background asset in dark mode.

### Fixed

- Feynman evaluation failures now surface actionable feedback and retain pending results when persistence fails.
- Book detail loading no longer substitutes summary-only records for persisted analysis.
- Account migration handles administrator-owned tables without silently abandoning migration.
- Administrator forms preserve same-origin request metadata, including navigation from Account Center.

### Security

- Browser roles have no direct access to account tables; database operations run through authenticated server routes.
- Account queries and mutations are scoped by the user ID resolved from the HttpOnly session cookie.
- Deleted books enter a seven-day user-visible recycle bin and are automatically purged after the thirty-day server retention deadline.
- Administrator access is denied by default, requires an independently provisioned role plus TOTP, and never trusts client-side role flags or URL parameters.
- The sole administrator's UUID and provider subject are server-only configuration; missing bindings deny access. Real account identifiers are excluded from published source and test fixtures.
- Administrator pages, data routes, and retained administrator JavaScript chunks are protected by server authorization. Credentials and encrypted snapshots are not returned by generic data browsing.

[0.2.0]: https://github.com/HachikoJ/Feynman-Reader/releases/tag/v0.2.0
[0.2.1]: https://github.com/HachikoJ/Feynman-Reader/releases/tag/v0.2.1
