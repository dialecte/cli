/** Helpers of the config reader tests: what a reader refused, and a finding with its wording left free. */
import { ConfigRefusal } from '../src/lib/config/config-refusal.ts'
import { thrownBy } from './thrown-by.ts'

import { expect } from 'vitest'

import type { ConfigFinding } from '../src/lib/config/config.types.ts'

/** A finding at `file:line` on `key`, its problem matching `problem` (any non-blank text by default). */
export function findingOf(params: {
	file: string
	line: number
	key: string
	problem?: RegExp
}): ConfigFinding {
	return {
		file: params.file,
		line: params.line,
		key: params.key,
		problem: expect.stringMatching(params.problem ?? /\S/) as unknown as string,
	}
}

/** The findings a `ConfigRefusal` thrown by `action` holds; else what it threw (undefined when nothing). */
export function refusalFindingsOf(action: () => unknown): unknown {
	const error = thrownBy(action)
	return error instanceof ConfigRefusal ? error.findings : error
}
