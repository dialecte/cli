import type { ReadCallOf } from '../host.types.ts'
/** The GitHub adapter's call names, from its table. */
import type { GITHUB_CALLS } from './github-calls.constants.ts'

/** The name of one `gh` call of the table. */
export type GithubCall = keyof typeof GITHUB_CALLS

/** The names of the table's read calls. */
export type GithubReadCall = ReadCallOf<typeof GITHUB_CALLS>
