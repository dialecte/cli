/** The GitHub vendor's runtime record: how an origin is recognised as GitHub's, and its adapter. */
import { GITHUB_CALLS } from './github-calls.constants.ts'
import { createGithubHost } from './github-host.ts'
import { GH_COMMAND } from './github.constants.ts'

import type { HostVendor } from '../host.types.ts'

/** GitHub through `gh`; `ssh.github.com` is what `ssh -G` answers for the port-443 setup. */
export const GITHUB_VENDOR: HostVendor<typeof GITHUB_CALLS> = {
	name: 'github',
	tool: GH_COMMAND,
	remoteHosts: ['github.com', 'ssh.github.com'],
	calls: GITHUB_CALLS,
	createAdapter: createGithubHost,
}
