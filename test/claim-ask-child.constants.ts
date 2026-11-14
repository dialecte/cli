import { join } from 'node:path'

/** The child process of the ask id cases (Node runs its type stripping), how many ids each claims, the case's time. */
export const CLAIM_CHILD = join(import.meta.dirname, 'claim-ask-child.ts')
export const CLAIMS_PER_CHILD = 25
export const CLAIM_CASE_TIMEOUT = 30_000
