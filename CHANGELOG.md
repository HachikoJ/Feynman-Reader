# Changelog

Notable changes to Feynman Reader are recorded here.

## Unreleased

### Added

- Username/password registration and sign-in as a fallback account channel; email is collected as an unverified account identifier.
- Watcha OAuth account login with persistent server-side sessions.
- PostgreSQL-backed books, settings, quotes, assistant sessions, long-term memories, activity history, and account statistics.
- Account Center with cloud bookshelf, quote management, recycle bin, data transfer, and activity calendar.
- Legacy IndexedDB migration with newer-record conflict resolution and sample-book exclusion.

### Changed

- Personal data now requires sign-in and is stored in the account cloud; IndexedDB remains only as a legacy migration source.
- TokenDance API keys are encrypted server-side and excluded from cloud exports.
- User-created quotes are prioritized over the bundled 101-quote system library.

### Security

- Browser roles have no direct access to account tables; database operations run through authenticated server routes.
- Account queries and mutations are scoped by the user ID resolved from the HttpOnly session cookie.
- Deleted books enter a seven-day user-visible recycle bin and are automatically purged after the thirty-day server retention deadline.
