/** The GitHub vendor's runtime record: how an origin is recognised as GitHub's, its adapter and its live probes. */
import { GITHUB_CALLS } from './github-calls.constants.ts'
import { GITHUB_RECORDED_VERSIONS } from './github-contract.constants.ts'
import { createGithubHost } from './github-host.ts'
import { GITHUB_PROBES, GITHUB_SUBJECT } from './github-probes.ts'
import {
	GH_COMMAND,
	GITHUB_REMOTE_HOSTS,
	GITHUB_SUBJECT_CALL,
	GITHUB_VENDOR_NAME,
} from './github.constants.ts'
import { fieldsOf, helpOf, runGh, typeOf, versionOf } from './run-gh.ts'

import type { HostDescribe, HostVendor, HostVendorSeams } from '../host.types.ts'

/** How `gh` describes itself: its help, a command's fields, a GraphQL type and its version. */
export const GITHUB_DESCRIBE: HostDescribe = { helpOf, fieldsOf, typeOf, versionOf }

/** GitHub through `gh`. */
export const GITHUB_VENDOR: HostVendor<typeof GITHUB_CALLS, typeof GITHUB_SUBJECT_CALL> &
	HostVendorSeams = {
	name: GITHUB_VENDOR_NAME,
	tool: GH_COMMAND,
	remoteHosts: GITHUB_REMOTE_HOSTS,
	calls: GITHUB_CALLS,
	recordedVersions: GITHUB_RECORDED_VERSIONS,
	subject: GITHUB_SUBJECT,
	probes: GITHUB_PROBES,
	run: runGh,
	describe: GITHUB_DESCRIBE,
	createAdapter: createGithubHost,
}
