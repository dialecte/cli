/**
 * Scratch packages and hand-overs for the tests of the hand-over per profile: a package with one edited file and
 * one lot, the folder written, the files of a written folder edited the way a person's edit would be.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import { hashFile } from '../src/lib/handover/write-handover.ts'
import { STANDARD_FILE } from '../src/lib/standard/standard.constants.ts'
import {
	GREEN_GATE_STEP,
	PROFILE_LOT_MESSAGE,
	PROFILE_LOT_PATH,
	STANDARD_RECORDED_AT,
} from './handover-profile.constants.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { BRANCH_NAME, WRITER_CLI } from './scratch-checks.constants.ts'
import { headOf, runGateIn, writeHandoverFolder } from './scratch-checks.ts'
import { EDITED_SOURCE_TEXT, SOURCE_FILE } from './scratch-contrib.constants.ts'
import { createContribPackage, runContribIn } from './scratch-contrib.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'

import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { LotsFile, MergeLotPlan } from '../src/lib/handover/handover.types.ts'
import type { StandardRecord } from '../src/lib/standard/standard.types.ts'
import type { JsonCard } from './handover-profile.types.ts'
import type { ContribPackageParams } from './scratch-contrib.types.ts'

/** A package whose gate holds one passing step and whose one source file is edited, uncommitted. */
export function editedPackage(params: ContribPackageParams = {}): string {
	const root = createContribPackage({ gateFast: [GREEN_GATE_STEP], ...params })
	writeFiles({ root, files: { [SOURCE_FILE]: EDITED_SOURCE_TEXT } })
	return root
}

/** The package's source file edited again: the tree of the earlier runs is another one. */
export function editAgain(root: string): void {
	writeFiles({ root, files: { [SOURCE_FILE]: `${EDITED_SOURCE_TEXT}export const second = 2\n` } })
}

/** `gate` (fast) then `dialecte contrib` on the tree as it is: the records the card reads, green or not. */
export async function recordGateAndContrib(root: string): Promise<void> {
	await runGateIn({ cwd: root, argv: [] })
	await runContribIn({ cwd: root })
}

/** The hand-over of the package's one lot written; its folder. */
export function writeProfileHandover(params: { root: string; message?: string }): string {
	return writeHandoverFolder({
		root: params.root,
		lots: [{ paths: [PROFILE_LOT_PATH], message: params.message ?? PROFILE_LOT_MESSAGE }],
	}).out
}

/** The card as printed and as `--json`: the folder is written, then taken again with `--rehash`. */
export function cardOf(params: {
	root: string
	/** What the station recorded about the standard, written in the folder before the card is built. */
	standard?: Pick<StandardRecord, 'state' | 'note'>
}): { text: string; data: JsonCard; out: string } {
	const { root } = params
	const out = temporaryFolder('dialecte-profile-card-')
	if (params.standard)
		writeFileSync(
			join(out, STANDARD_FILE),
			JSON.stringify({ ...params.standard, at: STANDARD_RECORDED_AT }),
		)
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: headOf(root),
		gates: 'npm run check',
		lots: [{ paths: [PROFILE_LOT_PATH], message: PROFILE_LOT_MESSAGE }],
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	const text = runHandover({ argv: [lotsPath], cliPath: WRITER_CLI, probe: noRepositoryCli })
	const json = runHandover({
		argv: [lotsPath, '--rehash', '--json'],
		cliPath: WRITER_CLI,
		probe: noRepositoryCli,
	})
	if (text.exitCode !== 0 || json.exitCode !== 0)
		throw new Error(`the hand-over was not written: ${text.output}\n${json.output}`)
	return { text: text.output, data: JSON.parse(json.output) as JsonCard, out }
}

/** The lot's message replaced in a written folder and its review hash taken again, as a hand-written folder holds it. */
export function replaceLotMessage(params: { out: string; message: string }): void {
	const lotsPath = join(params.out, 'lots.json')
	const lotsFile = JSON.parse(readFileSync(lotsPath, 'utf8')) as LotsFile
	const [first, ...rest] = lotsFile.lots
	writeFileSync(
		lotsPath,
		`${JSON.stringify({ ...lotsFile, lots: [{ ...first, message: params.message }, ...rest] }, null, '\t')}\n`,
	)
	writeFileSync(join(params.out, 'lots.sha256'), `${hashFile(lotsPath)}\n`)
}

/** A lot file's text replaced after the folder was written, its line of the snapshot taken again. */
export function replaceLotFile(params: {
	root: string
	out: string
	file: string
	text: string
}): void {
	const path = join(params.root, params.file)
	const snapshotPath = join(params.out, 'files.sha256')
	const before = hashFile(path)
	writeFileSync(path, params.text)
	writeFileSync(snapshotPath, readFileSync(snapshotPath, 'utf8').replace(before, hashFile(path)))
}

/** The card of a hand-over folder written already, printed again (`--rehash`): the repository is held by that folder. */
export function printCardAgain(out: string): string {
	const result = runHandover({
		argv: [join(out, 'lots.json'), '--rehash'],
		cliPath: WRITER_CLI,
		probe: noRepositoryCli,
	})
	if (result.exitCode !== 0) throw new Error(`the card was not printed: ${result.output}`)
	return result.output
}

/** A package on `main` with a branch `feat/x` holding one commit that edits the source file; its tip and merged tree. */
export function createBranchToMerge(params: {
	steps?: GateStep[]
	/** The branch commit changes `dialecte.contrib.steps` to these steps (package.json) besides the source file. */
	branchSteps?: GateStep[]
}): {
	root: string
	tip: string
	tree: string
} {
	const root = createContribPackage({ gateFast: [GREEN_GATE_STEP], steps: params.steps ?? [] })
	git({ root, args: ['checkout', '-q', '-b', BRANCH_NAME] })
	writeFiles({ root, files: { [SOURCE_FILE]: EDITED_SOURCE_TEXT } })
	if (params.branchSteps) {
		const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
		packageJson.dialecte.contrib = { steps: params.branchSteps }
		writeFiles({ root, files: { 'package.json': `${JSON.stringify(packageJson)}\n` } })
	}
	git({ root, args: ['commit', '-q', '-am', 'feat(a): the branch work'] })
	const tip = headOf(root)
	git({ root, args: ['checkout', '-q', 'main'] })
	const tree = git({ root, args: ['merge-tree', '--write-tree', 'HEAD', BRANCH_NAME] })
		.split('\n')[0]
		.trim()
	return { root, tip, tree }
}

/** The hand-over of one merge lot bringing `feat/x` in, with the tree it must hold (as a rehearsal reports it). */
export function writeMergeHandoverWithTree(params: {
	root: string
	tip: string
	tree: string
}): string {
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: BRANCH_NAME,
		tip: params.tip,
		resolved: {},
		message: 'merge: bring feat/x in',
		tree: params.tree,
	}
	return writeHandoverFolder({ root: params.root, lots: [mergeLot] }).out
}

/** A new install: `node_modules/.package-lock.json` holds something else. */
export function installAgain(root: string): void {
	writeFiles({ root, files: { 'node_modules/.package-lock.json': '{"packages":{}}\n' } })
}

/** HEAD moved by a commit that changes nothing: the state tree is the same, HEAD is another commit. */
export function moveHeadWithSameTree(root: string): void {
	git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: move HEAD'] })
}
