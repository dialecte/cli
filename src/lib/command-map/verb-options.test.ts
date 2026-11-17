/** `unknownOptionRefusal`: a verb's options read from its usage lines in the command map, anything else refused. */
import { HANDOVER_HIDDEN_OPTIONS } from '../handover/handover.constants.ts'
import { linesOf } from '../print/print.ts'
import { COMMAND_MAP } from './command-map.constants.ts'
import { renderCommandSection } from './render-help.ts'
import { unknownOptionRefusal } from './verb-options.ts'

import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../command-result.types.ts'
import type { ListedCommandName } from './command-map.types.ts'

type RefusalCase = {
	title: string
	name: ListedCommandName
	argv: string[]
	/** The first line of the refusal; undefined: accepted. */
	refused?: string
}

const CASES: RefusalCase[] = [
	{
		title: 'handover run --dry-run → refused, naming the option',
		name: 'handover',
		argv: ['run', '--dry-run'],
		refused: 'handover: unknown option --dry-run',
	},
	{
		title: 'handover run with a folder and an unknown option after it → refused',
		name: 'handover',
		argv: ['run', 'some-folder', '--rehearse', '--fast'],
		refused: 'handover: unknown option --fast',
	},
	{
		title: "handover show --rehearse (another verb's option) → refused",
		name: 'handover',
		argv: ['show', '--rehearse'],
		refused: 'handover: unknown option --rehearse',
	},
	{
		title: 'handover show --probe (hidden on run only) → refused',
		name: 'handover',
		argv: ['show', '--probe'],
		refused: 'handover: unknown option --probe',
	},
	{
		title: 'handover abandon --json (no usage line gives it) → refused',
		name: 'handover',
		argv: ['abandon', 'a-folder', '--json'],
		refused: 'handover: unknown option --json',
	},
	{
		title: 'handover list --root given last without its value → refused, it needs a value',
		name: 'handover',
		argv: ['list', '--root'],
		refused: 'handover: --root needs a value',
	},
	{
		title:
			'handover <lots.json> with an unknown option (the write form without its verb) → refused',
		name: 'handover',
		argv: ['lots.json', '--dry-run'],
		refused: 'handover: unknown option --dry-run',
	},
	{
		title:
			'handover run -- --dry-run (-- hiding an option from the check) → refused, no usage line holds --',
		name: 'handover',
		argv: ['run', '--', '--dry-run'],
		refused: 'handover: unknown option --',
	},
	{
		title: 'handover show --legend (an option of the line without a verb) → refused',
		name: 'handover',
		argv: ['show', '--legend'],
		refused: 'handover: unknown option --legend',
	},
	{
		title: 'handover run with every option its usage line names → accepted',
		name: 'handover',
		argv: [
			'run',
			'a-folder',
			'--rehearse',
			'--keep',
			'--full',
			'--resume-merge',
			'--not-a-lot',
			'--by',
			'reviewer',
			'--reason',
			'a reason',
		],
	},
	{
		title: 'handover run --probe (what commit.sh asks) → accepted',
		name: 'handover',
		argv: ['run', '--probe'],
	},
	{
		title: 'handover write with every option → accepted',
		name: 'handover',
		argv: [
			'write',
			'lots.json',
			'--release',
			'--target',
			'main',
			'--out',
			'0001-x',
			'--rehash',
			'--json',
		],
	},
	{
		title: 'handover <lots.json> with the options of write → accepted',
		name: 'handover',
		argv: ['lots.json', '--out', '0001-x', '--rehash'],
	},
	{
		title: 'handover --legend → accepted',
		name: 'handover',
		argv: ['--legend'],
	},
	{
		title: 'handover review with --json and --print → accepted',
		name: 'handover',
		argv: ['review', '1', '--json', '--print'],
	},
	{
		title: 'handover list --root <dir> --json → accepted',
		name: 'handover',
		argv: ['list', '--root', 'a-folder', '--json'],
	},
	{
		title: 'gate --dry-run → refused, naming the option',
		name: 'gate',
		argv: ['--dry-run'],
		refused: 'gate: unknown option --dry-run',
	},
	{
		title: 'gate --full --keep (a handover option) → refused',
		name: 'gate',
		argv: ['--full', '--keep'],
		refused: 'gate: unknown option --keep',
	},
	{
		title: 'gate --base given last without its value → refused, it needs a value',
		name: 'gate',
		argv: ['--fast', '--base'],
		refused: 'gate: --base needs a value',
	},
	{
		title: 'gate -- --full → refused, no usage line holds --',
		name: 'gate',
		argv: ['--', '--full'],
		refused: 'gate: unknown option --',
	},
	{
		title: 'gate with every option of its usage lines, --declare twice → accepted',
		name: 'gate',
		argv: [
			'--fast',
			'--base',
			'main',
			'--no-reuse',
			'--declare',
			'a.ts',
			'--declare',
			'b.ts',
			'--json',
		],
	},
	{
		title: 'gate --hook --no-reuse → accepted',
		name: 'gate',
		argv: ['--hook', '--no-reuse'],
	},
	{
		title: 'gate --release --base main → accepted',
		name: 'gate',
		argv: ['--release', '--base', 'main'],
	},
]

/** The check's parameters for a case: the handover ones carry its default verb and hidden options. */
function paramsOf(testCase: { name: ListedCommandName; argv: string[] }) {
	return {
		name: testCase.name,
		argv: testCase.argv,
		...(testCase.name === 'handover' && { defaultVerb: 'write', hidden: HANDOVER_HIDDEN_OPTIONS }),
	}
}

/** What the check answered: accepted, or the refusal's exit code and lines. */
function shapeOf(
	refusal: CommandResult | undefined,
): 'accepted' | { exitCode: number; lines: string[] } {
	return refusal === undefined
		? 'accepted'
		: { exitCode: refusal.exitCode, lines: linesOf(refusal.output) }
}

/** What a case expects: accepted, or exit 2 with its first line, an empty line and the command's usage section. */
function expectedOf(testCase: RefusalCase): 'accepted' | { exitCode: number; lines: string[] } {
	if (testCase.refused === undefined) return 'accepted'
	const usage = renderCommandSection({ name: testCase.name, entry: COMMAND_MAP[testCase.name] })
	return { exitCode: 2, lines: [testCase.refused, '', ...linesOf(usage)] }
}

/** A JSON refusal, parsed; undefined when accepted. */
function jsonShapeOf(
	refusal: CommandResult | undefined,
): { exitCode: number; json: unknown } | undefined {
	return refusal && { exitCode: refusal.exitCode, json: JSON.parse(refusal.output) as unknown }
}

describe('unknownOptionRefusal', () => {
	for (const testCase of CASES)
		it(testCase.title, () => {
			expect(shapeOf(unknownOptionRefusal(paramsOf(testCase)))).toEqual(expectedOf(testCase))
		})

	it('an unknown option with --json, which the verb takes → { error, usage, next: null }, exit 2', () => {
		const usage = renderCommandSection({ name: 'handover', entry: COMMAND_MAP.handover })
		const argv = ['show', '--bogus', '--json']

		expect(jsonShapeOf(unknownOptionRefusal(paramsOf({ name: 'handover', argv })))).toEqual({
			exitCode: 2,
			json: { error: 'unknown option --bogus', usage, next: null },
		})
	})
})
