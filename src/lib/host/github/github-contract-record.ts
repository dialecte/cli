/** The GitHub vendor's dev-only record: its table, what was recorded of `gh`, and how `gh` is asked again. */
import { GITHUB_CALLS } from './github-calls.constants.ts'
import { GITHUB_CONTRACT, GITHUB_RECORDED_VERSIONS } from './github-contract.constants.ts'
import { GITHUB_VENDOR_NAME } from './github.constants.ts'
import { fieldsOf, helpOf, impliedFlagsOf, typeOf, versionOf } from './run-gh.ts'

import type { HostContractRecord, HostDescribe } from '../host.types.ts'

/** How `gh` is asked again: its help, a command's fields, a GraphQL type and its version. */
const GITHUB_DESCRIBE: HostDescribe = { helpOf, fieldsOf, typeOf, versionOf }

export const GITHUB_CONTRACT_RECORD: HostContractRecord = {
	name: GITHUB_VENDOR_NAME,
	calls: GITHUB_CALLS,
	contract: GITHUB_CONTRACT,
	versions: GITHUB_RECORDED_VERSIONS,
	impliedFlagsOf,
	describe: GITHUB_DESCRIBE,
}
