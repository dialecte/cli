import { resolve } from 'node:path'

import { STANDARD_ENVIRONMENT_VARIABLE } from './standard.constants.ts'

/**
 * What `DIALECTE_STANDARD` names, as an absolute path; undefined when it is not set or empty. The environment
 * only (the process's own when none is given): no committed file names a standard. Whether the path exists is
 * the caller's question.
 */
export function readStandardRoot(
	params: { environment?: NodeJS.ProcessEnv } = {},
): string | undefined {
	const value = (params.environment ?? process.env)[STANDARD_ENVIRONMENT_VARIABLE]
	return value ? resolve(value) : undefined
}
