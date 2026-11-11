/** The root notes whose change runs the whole suite: tests read them. */
export const WHOLE_SUITE_NOTES = ['README.md', 'CHANGELOG.md'] as const

/** A test that spawns the cli entry and imports nothing of src. */
export const SPAWNING_TEST = [
	"import { spawnSync } from 'node:child_process'",
	"import { expect, it } from 'vitest'",
	'',
	"it('the entry runs', () => {",
	"\tconst run = spawnSync(process.execPath, ['src/cli.ts'], { encoding: 'utf8' })",
	"\texpect(run.stdout).toContain('entry')",
	'})',
	'',
].join('\n')
