/**
 * Suite setup (vitest `setupFiles`): the suite may run inside a commit hook, where git sets
 * GIT_DIR, GIT_INDEX_FILE, its config and the commit's identity. The tests spawn git in scratch
 * repositories with this process's environment: cleared here, before any test, those commands act
 * on their own folder only. Nor do they read the person's global or system git config (a `dialecte.*` key, an
 * alias, a default branch): the suite sees what a CI machine sees, an empty one.
 */
import { HANDOVER_VARIABLES } from '../src/lib/gate/selection.constants.ts'
import { clearRepositoryEnvironment } from '../src/lib/git-environment.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../src/lib/standard/standard.constants.ts'
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

// a hand-over's variables for a commit's hook (its base and folder, the store a rehearsal hands it) are that hook's:
// a case spawning its own scratch hook must never read or write the real repository's store with them
for (const name of HANDOVER_VARIABLES) delete process.env[name]

// git reads /dev/null as an empty config file
process.env.GIT_CONFIG_GLOBAL = '/dev/null'
process.env.GIT_CONFIG_NOSYSTEM = '1'

// the standard the person works against is theirs, not the suite's: the cases that need one set it themselves
delete process.env[STANDARD_ENVIRONMENT_VARIABLE]
