### Changed

- The lot verbs that reach the host (`lot land`, `lot approve`, `lot review`, `lot close`, `lot stop`, `lot pr`, `lot status`) pick it from the repository's origin, on each call: a `github.com` origin in any form (https, scp, ssh, the port-443 `ssh.github.com`), or an ssh alias that `ssh -G` resolves to one of these.
- **Breaking:** an origin on another host (a self-hosted GitHub such as `github.company.com`, or a local path) is refused with a message naming the host, where gh used to be asked anyway. Set the new personal key `host` to `github` (`dialecte config`; per repository through `repos:`) to use it. The key applies only when the origin names no known host.
- `lot review` prints the pull request's files page as the host gives it.
- The cli's own development now checks every `gh` call it makes against gh's description of itself: a field, flag or command gh does not have fails the cli's tests before a release.
