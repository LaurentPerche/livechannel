# Project Working Agreement

This file captures the standard operating preferences for how we work together on any coding project.

It is meant to reduce repeated explanations in future sessions and keep product direction, code, documentation, releases, and project decisions aligned.

## Core Operating Rules

* Treat the GitHub repository as the source of truth for the project.
* Keep product direction, shipped state, and near-term next steps documented in the repo.
* When meaningful features ship, update the supporting docs in the same pass instead of leaving them stale.
* Prefer small, testable increments over large speculative changes.
* Preserve a working build, package, demo, or deployment history whenever the project supports it.
* Keep a clear distinction between what is implemented, what is tested, what is released, and what is only planned.
* Avoid pretending that something is complete when external setup, credentials, permissions, accounts, or manual user action are still required.

## Documentation Rules

* Keep `README.md` aligned with the current real project state.
* Keep `ROADMAP.md` updated whenever product scope, priorities, or shipped milestones materially change.
* Keep `VERSION_HISTORY.md`, `CHANGELOG.md`, or the project's equivalent release timeline updated whenever a meaningful release or shipped milestone is created.
* If the project uses a different documentation structure, identify it early and keep the equivalent files current.
* If we establish new recurring workflow expectations, update this file.
* Do not let the roadmap drift behind the code.
* Do not let the shipped timeline drift behind actual releases.
* Do not leave project-critical knowledge only in chat. Put durable decisions in the repo.

## Repository Rules

* Put important work in version control.
* Push meaningful completed changes to the repo rather than leaving them only local.
* Prefer clear commit messages that reflect the actual user-facing change.
* Keep commits focused enough that changes can be reviewed, reverted, or understood later.
* Avoid mixing unrelated changes in the same commit unless there is a clear reason.
* When practical, include a short summary of what changed and why.
* Every meaningful GitHub commit should include any working agreement updates discovered during the session, when applicable. Do not leave new recurring preferences only in chat. If a coding model learns a durable preference about how the project should be managed, documented, released, tested, or communicated, it must update `WORKING_AGREEMENT.md` before committing.
* Do not overwrite or remove user work without explicitly identifying the risk first.

## Branching Rules

* Use the project's existing branching model when one exists.
* If there is no established model, prefer a simple branch per meaningful feature, fix, or experiment.
* Keep the main branch in a working state.
* Merge only when the change is coherent, tested enough for the current project stage, and documented where needed.
* Clean up obsolete experimental branches when they are no longer useful.

## Release Rules

* For release-sized or user-testable changes, create a fresh build, package, prerelease, release, or deployment according to the project's normal workflow.
* Provide a direct download link, release link, deployment URL, or test instruction after packaging or deploying a release.
* Include a short summary of what changed in the release notes.
* When updating a GitHub release or related GitHub release update, capture the time taken since the previous release so Laurent can see how long the release took with Codex.
* Record an approximate implementation-and-release effort estimate for each shipped version in the project's release history file when practical.
* Keep a cumulative total estimated effort line near the top of the project's release history file and update it whenever a new shipped release is added.
* When the project uses `VERSION_HISTORY.md`, include an approximate time-spent estimate for each shipped release so effort stays visible over time.
* When the project uses `VERSION_HISTORY.md`, update the cumulative total estimated effort whenever a new shipped release is recorded.
* Include the release version and SHA-256 checksum when practical for downloadable artifacts.
* Reflect released changes in the project's release history file.
* Use simple sequential version names such as `v0.3.1`, `v0.3.2`, and `v1.0.0` unless the project already has a different versioning convention.
* Avoid confusing suffix-based versions unless there is a clear release process reason.

## Build, Test, and Quality Rules

* Before claiming work is complete, run the most relevant available checks for the project.
* Prefer fast, targeted tests during development and broader checks before release.
* If tests cannot be run, say exactly why and what remains unverified.
* When a bug is fixed, add or update a test when practical.
* Do not describe a feature as ready to test end to end if required external configuration is still missing.
* Keep dependencies, generated files, and build artifacts consistent with the project's existing conventions.
* Avoid unnecessary rewrites or architecture changes unless they clearly reduce risk or unlock important progress.

## Product Direction Rules

* Confirm the project's current product goal before making large scope decisions.
* Prioritize practical improvements that move the product closer to being useful.
* Prefer user-visible value over internal complexity unless the internal work is clearly necessary.
* Keep the roadmap grounded in what is actually feasible for the current project stage.
* Separate near-term work, later roadmap ideas, and speculative ideas.
* Do not silently expand scope. Call out meaningful scope changes before implementing them.

## UX and Usability Rules

* Prefer intentional, practical UX improvements over cosmetic complexity.
* Core workflows should feel obvious, reliable, and trustworthy.
* Settings and advanced options should stay understandable as features grow.
* Advanced options can exist, but they should not crowd the basic workflow.
* Error states should be clear, actionable, and honest.
* Avoid adding UI that looks complete if the underlying behavior is incomplete.

## Security, Privacy, and Configuration Rules

* Treat credentials, API keys, tokens, private URLs, and customer data as sensitive.
* Do not commit secrets to the repository.
* Use `.env`, secret managers, local configuration, or platform-specific secret handling according to the project's conventions.
* Clearly identify any manual setup required for accounts, credentials, permissions, OAuth apps, webhooks, or deployment targets.
* When working with user data, prefer conservative privacy defaults.
* Do not send sensitive data to external services unless the project explicitly requires it and the user understands the flow.
* Document any security-relevant setup that a future developer or coding model must know.

## Delivery Preferences

After meaningful work, summarize:

* What changed
* What was tested
* What was not tested
* Where the project stands now
* What the likely next step is

When asked for something testable, package, deploy, or provide runnable instructions instead of only describing code changes.

When progress is blocked by something the user must do manually, say so explicitly and early.

When user action is required, clearly separate:

* What is already implemented
* What exact manual step is required next
* Why that manual step is required
* What work can continue only after that step is done

## Communication Rules for Coding Models

* Be direct about uncertainty, blockers, and untested assumptions.
* Do not overstate completion.
* Do not hide failed commands, skipped tests, or unresolved issues.
* Explain important tradeoffs briefly before choosing an approach.
* Prefer concise status updates over long progress narratives.
* When changing files, name the files changed and explain why.
* When making a risky change, call out the risk before or immediately after the change.
* When there are multiple reasonable implementation paths, choose the simplest path that fits the project unless there is a strong reason to do otherwise.

## Current Recurring Expectations

* Keep the roadmap updated as meaningful features land.
* Keep a version-by-version shipped timeline updated when the project has releases.
* Keep downloadable builds, deployable artifacts, or release notes available when the project requires testing by the user.
* Favor small releases or testable increments when local testing by the user is useful.
* Keep version naming simple and sequential across roadmap entries, releases, and version history.
* When GitHub releases are used, include the elapsed time since the previous release in the GitHub release update when that timing is available.
* When practical, keep an approximate effort estimate visible in shipped-version history so release effort can be reviewed over time.
* When effort estimates are tracked in shipped-version history, keep a cumulative total near the top so the running release effort stays visible.
* Be very explicit whenever a manual prerequisite or external setup is the real blocker.
* Keep this agreement generic enough to apply across projects, while allowing each repo to add project-specific rules when needed.

## Project-Specific Notes

Use this section only for preferences that apply to the current project and should not be assumed for every other project.

Examples:

* Product priorities
* Platform constraints
* Packaging or deployment requirements
* Required integrations
* UX preferences unique to this project
* Known technical debt
* Important manual setup steps
* External accounts, credentials, or permissions that block end-to-end testing

Example only:

* A media tool repository might prefer compact, shareable outputs over maximum source quality by default.
* A public-distribution tool might require release instructions that help a new user find the repo, download the latest release, and install it without private-access steps.

Do not treat the examples above as global defaults. Replace this section with project-specific notes inside each repository as needed.

## How To Use This In Future Sessions

At the start of a new coding session, ask the coding model to read this file first:

`WORKING_AGREEMENT.md`

Then ask it to inspect the repository documentation, especially:

* `README.md`
* `ROADMAP.md`
* `VERSION_HISTORY.md`, `CHANGELOG.md`, or the project's equivalent release timeline
* Any project-specific setup, testing, deployment, or contribution documentation

That is the simplest way to re-establish the workflow without rewriting everything manually.

## Suggested Maintenance Rule

Whenever we notice a repeated preference such as how releases should be handled, how docs should be updated, how roadmap status should be reflected, what kinds of changes require testing, or what manual blockers must be called out, add it here once instead of repeating it in chat forever.
