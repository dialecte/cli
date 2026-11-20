/** The GitHub vendor's dev-only record: its table, what was recorded of `gh`, and how `gh` is asked again. */
import { GITHUB_CALLS } from './github-calls.constants.ts'
import { GITHUB_CONTRACT, GITHUB_RECORDED_VERSIONS } from './github-contract.constants.ts'
import { GITHUB_DESCRIBE } from './github-vendor.ts'
import { GITHUB_VENDOR_NAME } from './github.constants.ts'
import { impliedFlagsOf } from './run-gh.ts'

import type { HostContractRecord } from '../host.types.ts'

export const GITHUB_CONTRACT_RECORD: HostContractRecord = {
	name: GITHUB_VENDOR_NAME,
	calls: GITHUB_CALLS,
	contract: GITHUB_CONTRACT,
	versions: GITHUB_RECORDED_VERSIONS,
	impliedFlagsOf,
	// how `gh` is asked again: the runtime vendor's own reads
	describe: GITHUB_DESCRIBE,
}
