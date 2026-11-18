/** The GitHub vendor's dev-only record: its table, what was recorded of `gh`, and how `gh` is asked again. */
import { GITHUB_CALLS } from './github-calls.constants.ts'
import { GITHUB_CONTRACT, GITHUB_RECORDED_VERSIONS } from './github-contract.constants.ts'
import { fieldsOf, helpOf, impliedFlagsOf, typeOf, versionOf } from './run-gh.ts'

import type { HostContractRecord } from '../host.types.ts'

export const GITHUB_CONTRACT_RECORD: HostContractRecord = {
	name: 'github',
	calls: GITHUB_CALLS,
	contract: GITHUB_CONTRACT,
	versions: GITHUB_RECORDED_VERSIONS,
	impliedFlagsOf,
	describe: { helpOf, fieldsOf, typeOf, versionOf },
}
