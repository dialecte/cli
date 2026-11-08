import { resolve } from 'node:path'

import { checkRules } from '../../rules/check-rules.ts'

import { describe, expect, it } from 'vitest'

import type { RulesCheck } from '../../rules/check-rules.types.ts'

/** A generous bound for listing and reading a few dozen small files and parsing their syntax trees. */
const RULES_CHECK_TIME_BOUND_MS = 60_000

const PACKAGE_ROOT = resolve(import.meta.dirname, '../../../..')
const KNOWLEDGE_FOLDER = 'src/lib/knowledge'
const HELPER_FILES = [
	'test/synthetic-standard.ts',
	'test/synthetic-standard.types.ts',
	'test/synthetic-standard.constants.ts',
	'test/index-synthetic-standard.ts',
]

function summaryOf(check: RulesCheck): { errors: number; helperChecked: boolean } {
	return { errors: check.errors, helperChecked: check.files.includes(HELPER_FILES[0]) }
}

describe('the cli own rules check over its knowledge code and its test helper', () => {
	it(
		'the knowledge folder and the synthetic-standard helper → no error',
		() => {
			expect(
				summaryOf(
					checkRules({ root: PACKAGE_ROOT, givenFiles: [KNOWLEDGE_FOLDER, ...HELPER_FILES] }),
				),
			).toEqual({ errors: 0, helperChecked: true })
		},
		RULES_CHECK_TIME_BOUND_MS,
	)
})
