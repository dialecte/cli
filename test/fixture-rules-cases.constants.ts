import type { UnitContext, RuleName } from '../src/lib/rules/check-code-rules.types.ts'

export const FLAG_PATTERN = / \/\/ flag ([a-z-]+)$/

export const WIDGET_TEST_FILE = 'src/widget/add-widget.test.ts'

export const RUN_LINE = 'runWidgetTestCases.withExport({ testCases, act: async () => {} })'

export const NO_UNITS: UnitContext = { coreGroups: new Set(), ownImports: new Map() }

/** The unit context of the act rule cases: core's groups, and what each imported name of the fixtures is. */
export const ACT_UNITS: UnitContext = {
	coreGroups: new Set(['progress', 'perf']),
	ownImports: new Map([
		['addWidget', 'unit'],
		['removeWidget', 'unit'],
		['buildSource', 'test-support'],
	]),
}

/** The rules of the act step. */
export const ACT_RULES: readonly RuleName[] = [
	'transaction-spy',
	'act-repeats-call',
	'act-snapshot',
	'act-format-check',
]

/** The rules of the fixture document step: a finding of any of them is asserted, never a filtered subset of them. */
export const STEP_RULES: readonly RuleName[] = [
	'xml-splice',
	'xml-replace',
	'fixtures-module',
	'fixture-builder',
]

export const HEADER_LINES = [
	"import { describe, expect, it } from 'vitest'",
	"import { createTestProject } from '@dialecte/core/test'",
	"import { createWidgetTestProject, runWidgetTestCases } from '@dialecte/demo/test'",
	"import BaseXml from './fixtures/base.xml?raw'",
	'',
]
