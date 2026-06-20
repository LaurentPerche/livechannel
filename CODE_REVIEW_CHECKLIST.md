# Code Review Checklist

Use this checklist before committing meaningful changes.

* Scope control: Did the change stay tightly scoped to the task?
* No unnecessary rewrite: Did I avoid unneeded refactors, renames, reorganizations, or modernization?
* Behavior preservation: Did I preserve existing behavior unless a change was intentional?
* Tests: Did I run the most relevant checks, or clearly state what remains unverified?
* Documentation: Did I update docs that changed materially with the implementation?
* Dependencies: Did I avoid unnecessary new dependencies?
* Security: Did I avoid introducing secrets, unsafe handling, or exposed sensitive data?
* Privacy: Did I preserve sensible privacy defaults and avoid unnecessary data exposure?
* Manual blockers: Did I clearly call out any human-required steps or external blockers?
* Working agreement updates: Did I update `WORKING_AGREEMENT.md` if a durable recurring preference was discovered?
