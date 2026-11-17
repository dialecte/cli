import { BARE_TMPDIR_MESSAGE } from './check-code-rules.constants.ts'
import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	file: string
	text: string
	expected: { line: number; message: string }[]
	only?: boolean
}

const MAKE_IN_TEMPORARY =
	"import { tmpdir } from 'node:os'\nconst folder = mkdtempSync(join(tmpdir(), 'x-'))\n"

/** The file's `bare-tmpdir` findings. */
function bareTmpdirFindingsOf(testCase: TestCase): { line: number; message: string }[] {
	return checkCodeRules({
		file: testCase.file,
		text: testCase.text,
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
	})
		.filter((finding) => finding.rule === 'bare-tmpdir' && finding.severity === 'error')
		.map((finding) => ({ line: finding.line, message: finding.message }))
}

describe('bare-tmpdir', () => {
	const testCases: Record<string, TestCase> = {
		'tmpdir() in a production file → reported on its line, naming makeScratchFolder': {
			file: 'src/lib/gate/selection.ts',
			text: MAKE_IN_TEMPORARY,
			expected: [{ line: 2, message: BARE_TMPDIR_MESSAGE }],
		},
		'os.tmpdir() in a command file → reported': {
			file: 'src/commands/health.ts',
			text: "import os from 'node:os'\n\nexport function rootOf() {\n\treturn os.tmpdir()\n}\n",
			expected: [{ line: 4, message: BARE_TMPDIR_MESSAGE }],
		},
		'tmpdir() in the scratch module → not reported': {
			file: 'src/lib/scratch/scratch-root.ts',
			text: MAKE_IN_TEMPORARY,
			expected: [],
		},
		'tmpdir() in a test file → not reported': {
			file: 'src/lib/gate/selection.test.ts',
			text: MAKE_IN_TEMPORARY,
			expected: [],
		},
		'tmpdir() in a test support file → not reported': {
			file: 'test/scratch-repository.ts',
			text: MAKE_IN_TEMPORARY,
			expected: [],
		},
		'tmpdir imported under another name and called → reported on the call': {
			file: 'src/lib/gate/selection.ts',
			text: "import { tmpdir as temporary } from 'node:os'\nconst folder = temporary()\n",
			expected: [{ line: 2, message: BARE_TMPDIR_MESSAGE }],
		},
		'tmpdir passed by reference → reported where it is passed': {
			file: 'src/lib/gate/selection.ts',
			text: "import { tmpdir } from 'node:os'\nconst folders = [tmpdir].map((read) => read())\n",
			expected: [{ line: 2, message: BARE_TMPDIR_MESSAGE }],
		},
		'a tmpdir() call with an argument (not the os one) → not reported': {
			file: 'src/lib/gate/selection.ts',
			text: 'const folder = tmpdir(base)\n',
			expected: [],
		},
	}

	it.each(Object.entries(testCases))('%s', (_name, testCase) => {
		expect(bareTmpdirFindingsOf(testCase)).toEqual(testCase.expected)
	})
})
