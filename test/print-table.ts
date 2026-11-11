/** Runs every row of the print table through the real cli and judges what each command printed. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { COMMAND_MAP } from '../src/lib/command-map/command-map.constants.ts'
import { commandSurfaceOf } from '../src/lib/command-map/command-surface.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../src/lib/standard/standard.constants.ts'
import { runCliProcess } from './forged-cli-run.ts'
import { printFaultsOf } from './print-faults.ts'
import {
	FIXED_KEY_PREFIX,
	FIXED_ROWS,
	FORGED_WORD,
	FORGED_WORD_ESCAPED_OVERRIDE,
	JSON_FLAG,
	PRINT_ROWS,
	DECOY_STANDARD,
	DECOY_STANDARD_FILE,
	DECOY_STANDARD_TEXT,
	STANDARD_FOLDER_PREFIX,
	USAGE_PREFIX,
} from './print-table.constants.ts'
import { PRINT_POOL_SIZE, PRINT_ROW_TIMEOUT } from './test-timing.constants.ts'

import type { CliProcessRun } from './forged-cli-run.types.ts'
import type {
	PrintRow,
	PrintTableReport,
	RowKey,
	RowRuns,
	ScheduledRow,
} from './print-table.types.ts'

/**
 * The rows the command map asks for: a command with no verb gives one key, a command with verbs one key per verb
 * (`lot status`). `hasJson` is whether the usage lines of that command or verb write `--json`.
 */
export function rowKeysOf(): RowKey[] {
	return Object.entries(COMMAND_MAP).flatMap(function keysOfCommand([name, entry]): RowKey[] {
		if (!('usage' in entry)) return [{ key: name, name, verb: undefined, hasJson: false }]
		const { verbs } = commandSurfaceOf({ name, entry })
		const { usage } = entry
		function usageOf(prefix: string): string[] {
			return usage.filter((line) => line.startsWith(`${USAGE_PREFIX}${prefix}`))
		}
		if (verbs.length === 0)
			return [
				{
					key: name,
					name,
					verb: undefined,
					hasJson: usageOf(name).some((line) => line.includes(JSON_FLAG)),
				},
			]
		return verbs.map((verb) => ({
			key: `${name} ${verb}`,
			name,
			verb,
			hasJson: usageOf(`${name} ${verb}`).some((line) => line.includes(JSON_FLAG)),
		}))
	})
}

/** Every string a parsed JSON value holds, at any depth, keys included. */
function stringsOf(value: unknown): string[] {
	if (typeof value === 'string') return [value]
	if (Array.isArray(value)) return value.flatMap(stringsOf)
	if (typeof value === 'object' && value !== null)
		return Object.entries(value).flatMap(([key, inner]) => [key, ...stringsOf(inner)])
	return []
}

/** Why the JSON a run printed is wrong: it is no JSON, or no string of it is the forged value as written; undefined when right. */
export function jsonFaultOf(run: CliProcessRun): string | undefined {
	const text = (run.stdout.trim() === '' ? run.stderr : run.stdout).trim()
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return 'its output is not JSON'
	}
	return stringsOf(parsed).some((value) => value.includes(FORGED_WORD))
		? undefined
		: 'no string of its JSON holds the forged value as written'
}

/** The command's text, standard output then standard error. */
function textOfRun(run: CliProcessRun): string {
	return `${run.stdout}${run.stderr}`
}

/** The results of `work` over `items`, at most `PRINT_POOL_SIZE` running at once, in the order of `items`. */
async function runPooled<Item, Result>(params: {
	items: readonly Item[]
	work: (item: Item) => Promise<Result>
}): Promise<Result[]> {
	const results: Result[] = []
	let next = 0
	async function worker(): Promise<void> {
		while (next < params.items.length) {
			const index = next
			next += 1
			results[index] = await params.work(params.items[index])
		}
	}
	await Promise.all(Array.from({ length: PRINT_POOL_SIZE }, worker))
	return results
}

/** How many process runs the table makes: one per row, one more per row with a JSON form. */
export function printRunCount(): number {
	const rows = [...Object.values(PRINT_ROWS), ...FIXED_ROWS]
	return rows.length + rows.filter((row) => row.json !== undefined).length
}

/** Runs one scheduled row: its text form and, when it has one, its JSON form. */
async function runRow(params: {
	scheduled: ScheduledRow
	cwdOf: (row: PrintRow) => string
}): Promise<RowRuns> {
	const { scheduled } = params
	const cwd = params.cwdOf(scheduled.row)
	const standardFolder = scheduled.row.emptyStandard ? scratchStandardRoot() : undefined
	try {
		return await runRowIn({ scheduled, cwd, standardFolder })
	} finally {
		if (standardFolder !== undefined) rmSync(standardFolder, { recursive: true, force: true })
	}
}

/** A scratch standards root holding one decoy standard, so a `--standard` value that names none is quoted as unknown. */
function scratchStandardRoot(): string {
	const root = mkdtempSync(join(tmpdir(), STANDARD_FOLDER_PREFIX))
	mkdirSync(join(root, DECOY_STANDARD))
	writeFileSync(join(root, DECOY_STANDARD, DECOY_STANDARD_FILE), DECOY_STANDARD_TEXT)
	return root
}

/** Runs one scheduled row in `cwd`, its `DIALECTE_STANDARD` naming `standardFolder` when there is one. */
async function runRowIn(params: {
	scheduled: ScheduledRow
	cwd: string
	standardFolder: string | undefined
}): Promise<RowRuns> {
	const { scheduled, cwd, standardFolder } = params
	const env =
		standardFolder === undefined
			? scheduled.env
			: { ...scheduled.env, [STANDARD_ENVIRONMENT_VARIABLE]: standardFolder }
	const text = await runCliProcess({
		argv: scheduled.argv,
		cwd,
		timeout: PRINT_ROW_TIMEOUT,
		env,
	})
	const json = scheduled.jsonArgv
		? await runCliProcess({
				argv: scheduled.jsonArgv,
				cwd,
				timeout: PRINT_ROW_TIMEOUT,
				env,
			})
		: undefined
	return { key: scheduled.key, row: scheduled.row, text, json }
}

/**
 * The table's report for the rows the map asks for (`keys`) and the fixed rows, run at most four at a time: `cwdOf`
 * gives the folder a row runs in (the shared scratch repository, or one of its own for an isolated row).
 */
export async function printReportOf(params: {
	keys: readonly RowKey[]
	cwdOf: (row: PrintRow) => string
}): Promise<PrintTableReport> {
	const { keys, cwdOf } = params
	const derived: ScheduledRow[] = keys
		.filter((each) => each.key in PRINT_ROWS)
		.map((each) => {
			const row = PRINT_ROWS[each.key]
			return {
				key: each.key,
				row,
				argv: [each.name, ...row.argv],
				jsonArgv: row.json && [each.name, ...row.json],
				env: undefined,
			}
		})
	const fixed: ScheduledRow[] = FIXED_ROWS.map((row) => ({
		key: `${FIXED_KEY_PREFIX}${row.title}`,
		row,
		argv: row.argv,
		jsonArgv: row.json,
		env: row.env,
	}))
	const runs = await runPooled({
		items: [...derived, ...fixed],
		work: (scheduled) => runRow({ scheduled, cwdOf }),
	})
	const names = keys.map((each) => each.key)
	return {
		missingRows: names.filter((name) => !(name in PRINT_ROWS)),
		staleRows: Object.keys(PRINT_ROWS).filter((name) => !names.includes(name)),
		missingReasons: runs
			.filter((each) => !each.row.quotes && !each.row.reason)
			.map((each) => each.key),
		jsonUnaccounted: keys
			.filter((each) => each.hasJson && each.key in PRINT_ROWS)
			.filter((each) => !PRINT_ROWS[each.key].json && !PRINT_ROWS[each.key].noJson)
			.map((each) => each.key),
		timedOut: runs
			.filter((each) => each.text.timedOut || each.json?.timedOut === true)
			.map((each) => each.key),
		faults: Object.fromEntries(
			runs
				.map((each) => [each.key, printFaultsOf(textOfRun(each.text))] as const)
				.filter(([, faults]) => faults.length > 0),
		),
		notShown: runs
			.filter(
				(each) => each.row.quotes && !textOfRun(each.text).includes(FORGED_WORD_ESCAPED_OVERRIDE),
			)
			.map((each) => each.key),
		jsonFaults: Object.fromEntries(
			runs.flatMap(function jsonFaultOfRow(each) {
				const fault = each.json === undefined ? undefined : jsonFaultOf(each.json)
				return fault === undefined ? [] : [[each.key, fault] as const]
			}),
		),
	}
}
