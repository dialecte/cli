/**
 * Suite setup (vitest `setupFiles`): the suite may run inside a commit hook, where git sets
 * GIT_DIR, GIT_INDEX_FILE, its config and the commit's identity. The tests spawn git in scratch
 * repositories with this process's environment: cleared here, before any test, those commands act
 * on their own folder only.
 */
import { clearRepositoryEnvironment } from '../src/lib/git-environment.ts'
import {
	CONFIG_ENVIRONMENT_VARIABLES,
	DISCOVERY_ENVIRONMENT_VARIABLES,
	IDENTITY_ENVIRONMENT_VARIABLES,
} from './git-environment.constants.ts'

clearRepositoryEnvironment(process.env)
for (const name of [
	...CONFIG_ENVIRONMENT_VARIABLES,
	...IDENTITY_ENVIRONMENT_VARIABLES,
	...DISCOVERY_ENVIRONMENT_VARIABLES,
])
	delete process.env[name]
