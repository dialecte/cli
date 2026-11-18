/** The one list of dev-only vendor records: the contract test and the refresh read it; no runtime code imports it. */
import { GITHUB_CONTRACT_RECORD } from './github/github-contract-record.constants.ts'

import type { HostContractRecord } from './host.types.ts'

export const HOST_CONTRACTS: readonly HostContractRecord[] = [GITHUB_CONTRACT_RECORD]
