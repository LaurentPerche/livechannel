# Engineering Principles

## 1. Smallest Correct Change

Choose the smallest change that correctly solves the problem. Prefer precise fixes over broad rewrites.

## 2. No Unnecessary Rewrites

Do not rewrite, refactor, rename, reorganize, or modernize code unless it is required by the task or explicitly approved.

## 3. Preserve Existing Behavior

Assume existing behavior matters unless the task explicitly changes it. When behavior changes intentionally, document the change clearly.

## 4. Simplicity First

Prefer straightforward solutions that are easy to understand, test, review, and maintain.

## 5. Dependency Discipline

Do not add new dependencies without a clear reason. Prefer existing project tooling and patterns when they are sufficient.

## 6. Testing Expectations

Run the most relevant available checks before claiming completion. Add or update tests when practical, especially for bug fixes and behavior-sensitive changes.

## 7. Review Before Commit

Before committing, review the diff for accidental scope creep, unnecessary churn, unclear naming, missing docs, and unverified assumptions.

## 8. Documentation Discipline

Keep the repo documentation aligned with reality. Update `README.md`, roadmap files, release history files, and other operational docs when meaningful changes land.

## 9. Error Handling

Handle failure paths honestly and clearly. Error states should be actionable for users and understandable for future maintainers.

## 10. Security and Privacy

Do not commit secrets. Treat credentials, tokens, customer data, and private URLs as sensitive. Prefer conservative handling of user data and explicitly document any security-relevant setup.

## 11. Performance Discipline

Avoid adding avoidable latency, excessive complexity, or resource-heavy behavior. Optimize only where it matters, but do not introduce obvious performance regressions.

## 12. When To Escalate To The Human

Escalate when:

* Scope meaningfully changes
* A destructive action is risky
* External credentials, accounts, or permissions block progress
* Multiple implementation paths have non-obvious tradeoffs
* A project-specific rule conflicts with the requested change

## 13. Avoid Code Comprehension Debt

Do not leave behind changes that make the codebase harder to reason about than before. Favor local clarity, preserve naming consistency, and add brief comments only where they materially reduce confusion.

## 14. Flag Optional Improvements Without Auto-Implementing Them

If you notice adjacent cleanup, future refactors, or quality improvements that are not required, call them out separately as optional follow-up work instead of implementing them automatically.
