/**
 * Scratch packages for the tests of the unwired default steps: a package whose npm scripts, and the `vitest` an
 * `npx vitest run` step finds in its `node_modules/.bin`, count their runs in a file outside the repository, so a
 * test says whether a step ran without running a real tool.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runGate } from '../src/commands/gate.ts'
import { computeCheckKey, gateCommandHash } from '../src/lib/gate-records/check-key.ts'
import { recordGate } from '../src/lib/gate-records/gate-records.ts'
import { DEFAULT_GATE_STEPS } from '../src/lib/gate/gate-config.constants.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { GATE_OWN_STEPS, STAND_IN_TEST_COUNT } from './rule-gaps-unwired.constants.ts'
import { createScratchRepository } from './scratch-repository.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { StepResult } from '../src/lib/gate/gate.types.ts'
import type { GateJson, UnwiredPackageParams } from './rule-gaps-unwired.types.ts'

/** A repository on `main` holding a package with the scripts it is given, each counting its run, and a counting vitest. */
export function createUnwiredPackage(params: UnwiredPackageParams): string {
	const counting = `echo run >> ${shellQuote(params.counter)}`
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({
			name: 'demo',
			scripts: Object.fromEntries(params.scripts.map((script) => [script, counting])),
			...(params.dialecte && { dialecte: params.dialecte }),
		})}\n`,
		'.gitignore': 'node_modules\n',
	})
	const bin = join(root, 'node_modules', '.bin')
	mkdirSync(bin, { recursive: true })
	writeFileSync(
		join(bin, 'vitest'),
		`#!/bin/sh\n${counting}\nprintf '%s\\n' ${shellQuote(STAND_IN_TEST_COUNT)}\n`,
	)
	chmodSync(join(bin, 'vitest'), 0o755)
	return root
}

/** `dialecte gate` in `cwd`. */
export function runGateWith(params: { cwd: string; argv: string[] }): Promise<CommandResult> {
	return runGate({ cwd: params.cwd, argv: params.argv })
}

/** What `--json` printed, parsed. */
export function parseGateJson(output: string): GateJson {
	return JSON.parse(output) as GateJson
}

/** The step lines of a gate's output (`ok`, `FAIL`, `skip`, `--`), the gate's own steps (hygiene, tdd) left out. */
export function stepLinesOf(output: string): string[] {
	return output.split('\n').filter(function isStepLine(line) {
		const match = /^(?:ok|FAIL|skip|--) +(\S+)/.exec(line)
		return match !== null && !(GATE_OWN_STEPS as readonly string[]).includes(match[1])
	})
}

/**
 * A green `gate --full` record of the tree as it is, written the way a cli before steps could be unwired wrote it:
 * the default full steps hashed as plain `[name, run]` pairs, the skills step skipped with its old reason when the
 * package lacks the script. The next `gate --full` on this tree answers from it only if its key is the same.
 */
export function seedPreUnwiredFullRecord(params: { root: string; skillsWired: boolean }): void {
	const { root } = params
	const steps = DEFAULT_GATE_STEPS.full
	const key = computeCheckKey({ root, commandHash: gateCommandHash({ root, steps }) })
	const results = steps.map(function resultOf(step): StepResult {
		if (step.name === 'skills' && !params.skillsWired)
			return {
				step,
				status: 'skipped',
				counts: {},
				restored: [],
				reason: 'no npm script "skills:check"',
			}
		return {
			step,
			status: 'passed',
			counts:
				step.counts === 'tests' ? { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } } : {},
			restored: [],
		}
	})
	recordGate({ root, mode: 'full', results, key })
}
