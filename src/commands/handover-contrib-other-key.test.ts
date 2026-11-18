/**
 * `handover run`'s `contrib` guard when the tree's green contrib record was made under another key: the guard names
 * what differs - the `file:` dependencies, the commit, the base branch's `CHANGELOG.md`, or the cli and its contrib rows
 * (with this cli's version) -
 * instead of saying only that there is none.
 */
import { rekeyStoredRecords } from '../../test/gate-records.ts'
import { editedPackage, installAgain, writeProfileHandover } from '../../test/handover-profile.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { runFolder } from '../../test/scratch-checks.ts'
import { runContribIn } from '../../test/scratch-contrib.ts'
import { git } from '../../test/scratch-repository.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	/** What changes after the green contrib run, before the hand-over is written. */
	arrange: (root: string) => void
	/** What the guard's line must name. */
	named: string
	only?: boolean
}

describe(
	'handover run: the contrib guard and another key',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const testCases: Record<string, TestCase> = {
			'the record keyed by another command hash (another cli, or other contrib rows) → names them and this cli':
				{
					arrange: (root) => rekeyStoredRecords({ root, key: { commandHash: 'f'.repeat(64) } }),
					named: `another cli or other contrib rows: this cli is ${readCliVersion()}`,
				},
			'the record keyed on other file: dependencies → names the file: dependencies': {
				arrange: (root) => rekeyStoredRecords({ root, key: { linked: 'e'.repeat(64) } }),
				named: 'file: dependencies changed since contrib',
			},
			"the record keyed on another base branch CHANGELOG.md → names the base branch's CHANGELOG.md":
				{
					arrange: (root) =>
						rekeyStoredRecords({
							root,
							key: {
								commandHash: 'f'.repeat(64),
								releaseChangelog: { tip: 'd'.repeat(40), mergeBase: 'd'.repeat(40) },
							},
						}),
					named: "the base branch's CHANGELOG.md changed since contrib",
				},
			'a commit made since contrib, the tree the same → names another commit': {
				arrange: (root) =>
					git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: later'] }),
				named: 'at another commit',
			},
		}

		const entries = Object.entries(testCases)
		const focused = entries.filter(([, testCase]) => testCase.only)
		for (const [title, testCase] of focused.length ? focused : entries)
			it(title, async () => {
				const root = editedPackage({ steps: [] })
				installAgain(root)
				await runContribIn({ cwd: root })
				testCase.arrange(root)
				const out = writeProfileHandover({ root })

				const run = await runFolder({ out })

				const line = run.text.split('\n').find((text) => /^[✗!] contrib\b/.test(text)) ?? ''
				expect({
					recorded: line.includes('was recorded under another key'),
					named: line.includes(testCase.named),
				}).toEqual({ recorded: true, named: true })
			})
	},
)
