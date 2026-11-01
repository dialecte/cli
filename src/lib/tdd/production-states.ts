/**
 * The production states the ledger keeps: per base, each production file changed since it, by its
 * content, for every state a receipt names. A red or a green taken while production moved back from the
 * newest content the lot reached to an earlier one (a file back at its content at the base, or at an
 * earlier receipt's) is flagged `rollback`.
 */
import { join } from 'node:path'

import { readGit } from '../git.ts'
import { hashFile, hashProduction, isProductionPath, listChangedSince } from './tdd-files.ts'
import { DELETED_PRODUCTION_FILE } from './tdd.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { HashedTestCase, ProductionState, TddLedger } from './tdd.types.ts'

/**
 * The production state of the package now: its `hashProduction`, the base, its production files changed
 * since that base.
 */
export function readProductionState(params: {
	root: string
	base: string
	packageJson: PackageJson
}): ProductionState {
	const { root, base, packageJson } = params
	const files: Record<string, string> = {}
	for (const file of listChangedSince({ root, base }))
		if (isProductionPath({ file, packageJson })) files[file] = hashFile(join(root, file))
	const deleted = readGit({
		root,
		args: ['diff', '--name-only', '--relative', '--no-renames', '--diff-filter=D', base],
	})
	for (const file of deleted.split('\n'))
		if (file && isProductionPath({ file, packageJson })) files[file] = DELETED_PRODUCTION_FILE
	return { hash: hashProduction({ root, packageJson }), base, files }
}

/**
 * The production files moved back: the ledger's receipts walked in order (states recorded with the
 * current base only, a receipt whose state is unrecorded skipped), holding each file's newest content (at
 * first its content at the base) and every content it reached. A state moves a file back when the file's
 * content there differs from its newest and is one it reached before (at the base or at a state that
 * advanced). A receipt advances, its state's contents becoming the newest and reached, when it is a green
 * or its state moved nothing back: a put back that only reds, refusals or unchanged receipts saw stays put
 * back and adds no content, a step a green proved (an experiment undone and kept) or a state moving
 * nothing back becomes the newest. The current state's files moved back, sorted.
 */
export function filesMovedBack(params: { ledger: TddLedger; current: ProductionState }): string[] {
	const { current } = params
	const states = params.ledger.production?.[current.base] ?? {}
	let newest: Record<string, string> = {}
	const had = new Map<string, Set<string>>()
	for (const entry of params.ledger.entries) {
		if (entry.kind === 'freeze' || !Object.hasOwn(states, entry.productionHash)) continue
		const files = states[entry.productionHash]
		// a state put back adds no content: a file moved forward there is not back when it comes again
		if (entry.kind !== 'green' && movedBackFrom({ files, newest, had }).length > 0) continue
		newest = files
		for (const [file, content] of Object.entries(files))
			had.set(file, (had.get(file) ?? new Set<string>()).add(content))
	}
	return movedBackFrom({ files: current.files, newest, had }).sort()
}

/**
 * Whether a green run at the current production state is flagged `rollback`: a production file moved back
 * (`movedBack` not empty) and a case it proves has no green receipt in the ledger before, of its own test call
 * (`caseHash`), whatever that green's flags (a refactor that keeps every proven case green is not flagged).
 */
export function isRollbackGreen(params: {
	ledger: TddLedger
	cases: readonly HashedTestCase[]
	movedBack: readonly string[]
}): boolean {
	const { ledger, cases, movedBack } = params
	if (movedBack.length === 0) return false
	return cases.some(
		(testCase) =>
			!ledger.entries.some(
				(entry) =>
					entry.kind === 'green' &&
					entry.file === testCase.file &&
					entry.name === testCase.name &&
					entry.project === testCase.project &&
					entry.caseHash === testCase.caseHash,
			),
	)
}

/**
 * The files of a state back at an earlier content: differing from the newest, and at their content at the
 * base (absent from the state) or at one they reached.
 */
function movedBackFrom(params: {
	files: Record<string, string>
	newest: Record<string, string>
	had: Map<string, Set<string>>
}): string[] {
	const { files, newest, had } = params
	return [...new Set([...Object.keys(newest), ...Object.keys(files)])].filter((file) => {
		const content = files[file]
		if (content === newest[file]) return false
		return content === undefined || (had.get(file)?.has(content) ?? false)
	})
}
