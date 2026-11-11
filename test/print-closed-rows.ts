/** The closed print rows (R6-4, R6-5, R6-6 and the catch of the cli): each builds its workspace, runs the real cli, and gives what it printed. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { LEDGER_FILE } from '../src/lib/review-rounds/review-rounds.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { runCliProcess } from './forged-cli-run.ts'
import { removeEntry, writeLotsFile } from './handover-store-scenario.ts'
import { entryPathOf, startRealLot, writeInto } from './lot-handover-workspace.ts'
import { PRINTED_KINDS } from './lot-printed-fields.constants.ts'
import { buildPrintedLot, forgeField } from './lot-printed-fields.ts'
import { createStartWorkspace } from './lot-start-workspace.ts'
import { readyLot } from './lot-stop-workspace.ts'
import {
	API_SEARCH_WORD,
	FORGED_API_INDEX_FILE,
	FORGED_ONE_LINE,
	LEDGER_HEADER,
	OPEN_LOT_NAME,
} from './print-closed-rows.constants.ts'
import { FORGED_WORD, TABLE_PACKAGE_JSON } from './print-table.constants.ts'
import { createScratchRepository, isolateGitConfig, writeFiles } from './scratch-repository.ts'
import { PRINT_ROW_TIMEOUT } from './test-timing.constants.ts'

import type { CliRun } from './lot-handover-workspace.types.ts'
import type { FolderFile } from './print-closed-rows.types.ts'

/** What the real cli printed for `argv` in `cwd`, standard output then standard error. */
async function printedBy(params: { argv: readonly string[]; cwd: string }): Promise<string> {
	const run = await runCliProcess({ ...params, timeout: PRINT_ROW_TIMEOUT })
	return `${run.stdout}${run.stderr}`
}

/** What `lot start <brief> ...extra` printed in a workspace holding `brief`, with an open real lot of `openScope` when given. */
export async function startText(params: {
	brief: Record<string, unknown>
	extra?: readonly string[]
	openScope?: readonly string[]
}): Promise<string> {
	const start = createStartWorkspace({ brief: params.brief })
	if (params.openScope)
		writeStoreLot({
			workspace: start.workspace,
			name: OPEN_LOT_NAME,
			scope: [...params.openScope],
		})
	return printedBy({
		argv: ['lot', 'start', start.workspace.briefPath, ...(params.extra ?? [])],
		cwd: start.cwd,
	})
}

/** What a `handover write --out <lot>` refusal printed, both streams together. */
function writtenText(run: CliRun): string {
	return run.output
}

/** Replaces the file `name` of `folder` (a published file is read-only: a hand replaces it) with `text`. */
function replaceFolderFile(params: { folder: string; file: FolderFile }): void {
	const path = join(params.folder, params.file.name)
	rmSync(path, { force: true })
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, params.file.text)
}

/** The kind of printed lot that has a hand-over, a question and its answer: the lot a recap reads. */
function recapKind() {
	const kind = PRINTED_KINDS.find((each) => each.real)
	if (kind === undefined) throw new Error('no real printed kind')
	return kind
}

/** What `lot recap <lot>` printed after the hand-over folder of a real lot got `files`. */
export async function recapText(files: readonly FolderFile[]): Promise<string> {
	const lot = buildPrintedLot(recapKind())
	for (const file of files) replaceFolderFile({ folder: lot.lotFolder, file })
	return printedBy({ argv: ['lot', 'recap', lot.name], cwd: lot.cwd })
}

/** A ledger holding the finding row `row`, as a file of the hand-over folder. */
export function ledgerOf(row: readonly string[]): FolderFile {
	return { name: LEDGER_FILE, text: `${LEDGER_HEADER}| ${row.join(' | ')} |\n` }
}

/** The lot declaration `declaration` as the hand-over folder's `lot.json`. */
export function declarationOf(declaration: unknown): FolderFile {
	return { name: 'lot.json', text: `${JSON.stringify(declaration)}\n` }
}

/** What the refusal printed for a real lot whose identity field `field` holds the forged value, asked a hand-over written into its folder. */
export function identityFieldText(field: string): string {
	const lot = startRealLot()
	forgeField({ file: join(lot.lotFolder, 'identity.json'), path: [field], time: false })
	return writtenText(writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree }))
}

/** What the refusal printed for a real lot asked a hand-over whose lots file names the forged one-line branch (the lots file refuses a line break itself). */
export function lotsFileBranchText(): string {
	const lot = startRealLot()
	const lotsPath = writeLotsFile({ root: lot.worktree, name: 'lot', branch: FORGED_ONE_LINE })
	return writtenText(writeInto({ lotsPath, out: lot.lotName, cwd: lot.worktree }))
}

/**
 * What the refusal printed for a ready lot whose registry entry is committed and named (an entry is named by its
 * file) with the forged value, asked a second hand-over.
 */
export function registryEntryText(): string {
	const { lot, name } = readyLot()
	const entryPath = entryPathOf({ lot, name })
	const entry = JSON.parse(readFileSync(entryPath, 'utf8')) as Record<string, unknown>
	removeEntry({ root: lot.start.repository, name })
	writeFileSync(
		join(dirname(entryPath), `${FORGED_WORD}.json`),
		JSON.stringify({ ...entry, state: 'committed' }),
	)
	return writtenText(writeInto({ lotsPath: lot.lotsPath, out: lot.lotName, cwd: lot.worktree }))
}

/** What the cli's own catch printed: `api find` over a package whose api index holds the forged text. */
export async function catchText(): Promise<string> {
	isolateGitConfig()
	const repository = createScratchRepository({ 'package.json': TABLE_PACKAGE_JSON })
	writeFiles({ root: repository, files: { [FORGED_API_INDEX_FILE]: FORGED_WORD } })
	return printedBy({ argv: ['api', 'find', API_SEARCH_WORD], cwd: repository })
}
