# Release Checklist

Use this checklist for release-sized or user-testable changes.

* Version number: Is the version assigned and consistent across release materials?
* Changelog or version history: Is `VERSION_HISTORY.md`, `CHANGELOG.md`, or equivalent updated?
* Release history effort estimate: Does the project's release history file include an approximate implementation-and-release effort estimate for this shipped version when practical?
* Cumulative effort total: Does the project's release history file keep a cumulative total estimated effort line near the top and update it when a new shipped release is added?
* Build and test status: Were the relevant checks run, and is the verification state clear?
* Release notes: Is there a concise summary of what changed?
* Release duration: When updating the GitHub release or related GitHub release notes, is the time taken since the previous release captured clearly so Laurent can see how long the release took with Codex?
* Version history time spent: When `VERSION_HISTORY.md` is used, does it include an approximate time-spent estimate for the shipped release so effort stays visible over time?
* Version history cumulative total: When `VERSION_HISTORY.md` is used, is the cumulative total estimated effort near the top updated for the new shipped release?
* SHA-256 checksum: Is a checksum provided when practical for downloadable artifacts?
* Downloadable artifact: Is there a package, binary, installer, or release asset when applicable?
* Deployment URL: Is the live URL or test URL provided when applicable?
* Rollback or known limitations: Are rollback notes, caveats, or known limitations documented when applicable?
