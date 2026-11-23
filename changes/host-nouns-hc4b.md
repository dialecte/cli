### Changed

- Every printed line of `lot land`, `lot approve`, `lot stop`, `lot close`, `lot prune`, `lot status` and `lot describe` that names the change request uses the host's own word: a repository whose origin is GitHub reads "pull request" as before; a repository no host serves (a local-path origin, no origin) reads "change request". The rendered body's stale tests line says the same.
- Two lines read files only and so print "change request" on every repository, GitHub's included: the hand-over card's stack line, and `lot status`'s stack line when no landing is read.
- `lot stop` of a queued lot says its change request is "out of the queue", not "out of the merge queue".
- The help, the command reference pages, `README.md` and `AGENTS.md` say "change request" and "the queue", and quote no `gh` command; the CI pages name GitHub Actions' `pull_request` event by its name.
- A landed fact whose change request does not read is damaged with the reason "changeRequest is not a change request record".

### Fixed

- Reading which host serves a repository spawns `ssh -G` once per ssh alias in a run, where every read spawned it again; and naming the change request for a repository whose folder is gone no longer throws.
