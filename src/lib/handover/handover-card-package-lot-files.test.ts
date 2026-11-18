/**
 * The card's tdd section with package lot files (CK-cli design 3.2.3): the root judged as today, one block per
 * non-empty package lot file, counted without judgement.
 */
import { show, writeStoreHandover } from '../../../test/handover-store-scenario.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

const PACKAGE_DECLARATION = `${JSON.stringify(
	{
		accept: [
			{ case: 'src/a.test.ts::a > one', reason: 'pins it' },
			{ case: 'src/a.test.ts::a > two', reason: 'pins it' },
		],
		revised: [{ case: 'src/b.test.ts::b > label', reason: 'the label moved' }],
		gone: [{ file: 'src/c.test.ts', reason: 'merged into b' }],
	},
	null,
	'\t',
)}\n`

/** A repository with the tracked packages `packages/ui` and `packages/kit`, `lotFiles` written, its hand-over written. */
function cardTddOf(lotFiles: Record<string, string>): string[] | undefined {
	const root = createScratchRepository({
		'src/read.ts': 'export function read() {}\n',
		'packages/ui/package.json': '{ "name": "ui" }\n',
		'packages/kit/package.json': '{ "name": "kit" }\n',
	})
	git({ root, args: ['checkout', '-q', '-b', 'feat/read'] })
	writeFiles({ root, files: lotFiles })
	const { folder } = writeStoreHandover({
		root,
		name: 'packages',
		changes: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' },
		lots: [{ paths: ['src/'], message: 'feat(read): read answers one' }],
	})
	const card = JSON.parse(show({ cwd: root, argv: [folder, '--json'] }).output) as {
		tdd?: string[]
	}
	return card.tdd
}

describe('the card: package lot files', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a non-empty package lot file -> one block for it, counted, without judgement', () => {
		expect(
			cardTddOf({
				'packages/ui/.dialecte/lot.json': PACKAGE_DECLARATION,
				'packages/kit/.dialecte/lot.json': '{}\n',
			}),
		).toEqual(["packages/ui: 2 accept, 1 revised, 1 gone (judged by that package's gate)"])
	})

	it('package lot files empty or absent -> no package block, the section as without packages', () => {
		expect(cardTddOf({ 'packages/kit/.dialecte/lot.json': '{}\n' })).toBeUndefined()
	})
})
