/**
 * Suite setup (vitest `setupFiles`): the suite may run inside a commit hook, where git sets
 * GIT_DIR, GIT_INDEX_FILE, its config and the commit's identity. The tests spawn git in scratch
 * repositories with this process's environment: cleared here, before any test, those commands act
 * on their own folder only. Nor do they read the person's global or system git config (a `dialecte.*` key, an
 * alias, a default branch): the suite sees what a CI machine sees, an empty one, but for its git starting no
 * background maintenance. Nor does npx find a machine-global package: npm's global prefix is an absent folder.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HANDOVER_VARIABLES } from '../src/lib/gate/selection.constants.ts'
import { clearRepositoryEnvironment } from '../src/lib/git-environment.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../src/lib/standard/standard.constants.ts'
import { NPM_INSTALL_OFF, NPM_INSTALL_SWITCH } from '../src/lib/worktree/worktree.constants.ts'
import {
	CONFIG_ENVIRONMENT_VARIABLES,
	DISCOVERY_ENVIRONMENT_VARIABLES,
	IDENTITY_ENVIRONMENT_VARIABLES,
	SUITE_GIT_CONFIG_FILE,
	SUITE_NPM_PREFIX_FOLDER,
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

// the suite's own global config: background maintenance off, nothing else
process.env.GIT_CONFIG_GLOBAL = SUITE_GIT_CONFIG_FILE
process.env.GIT_CONFIG_NOSYSTEM = '1'

// the standard the person works against is theirs, not the suite's: the cases that need one set it themselves
delete process.env[STANDARD_ENVIRONMENT_VARIABLE]

// a miss never spawns npm in the suite (workers and the children they start): the default npm runner answers a
// failure and the checkout gets the copy; the cases of the npm path inject their own runner
process.env[NPM_INSTALL_SWITCH] = NPM_INSTALL_OFF

// npm's global prefix is the suite's own, a folder never created inside the guarded suite folder: npx finds no
// machine-global package (a global cli would answer a case that wants none); the upper-case name is dropped so the
// lower-case one wins
delete process.env.NPM_CONFIG_PREFIX
process.env.npm_config_prefix = join(tmpdir(), SUITE_NPM_PREFIX_FOLDER)
