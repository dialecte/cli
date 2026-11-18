/** The GitHub vendor's runtime record: how an origin is recognised as GitHub's, and its adapter. */
import { GITHUB_CALLS } from './github-calls.constants.ts'
import { createGithubHost } from './github-host.ts'
import { GH_COMMAND, GITHUB_REMOTE_HOSTS, GITHUB_VENDOR_NAME } from './github.constants.ts'

import type { HostVendor } from '../host.types.ts'

/** GitHub through `gh`. */
export const GITHUB_VENDOR: HostVendor<typeof GITHUB_CALLS> = {
	name: GITHUB_VENDOR_NAME,
	tool: GH_COMMAND,
	remoteHosts: GITHUB_REMOTE_HOSTS,
	calls: GITHUB_CALLS,
	createAdapter: createGithubHost,
}
