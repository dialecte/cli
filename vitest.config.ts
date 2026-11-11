import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		env: {
			// the person's own config folder (their forbidden words) is never read: a folder that does not exist (under
			// the suite's temporary folder, nothing is created there); no run of the suite holds the machine awake (a
			// case that wants either sets it itself)
			XDG_CONFIG_HOME: join(tmpdir(), 'dialecte-no-config'),
			DIALECTE_KEEP_AWAKE: '0',
		},
		// the cases spawn the cli, git and npx, and the hooks remove scratch repositories and workspaces: on a machine
		// running other suites at full parallelism they passed vitest's defaults, 5 s for a case and 10 s for a hook
		// (2026-11-02, a commit hook's suite and a fast gate); bounds against a hang, not a measure of speed
		testTimeout: 30_000,
		hookTimeout: 60_000,
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		// the suite may run inside a commit hook: its git commands must never reach the committed repository
		setupFiles: ['./test/git-environment.setup.ts'],
		// one temporary folder for the whole run (TMPDIR of the workers and their children): any entry left fails it
		globalSetup: ['./test/suite-guard/temp-folder-guard.setup.ts'],
	},
})
