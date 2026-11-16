import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	file: string
	text: string
	expected: { line: number; message: string }[]
	only?: boolean
}

const MESSAGE =
	'a raw `git clone` or `git init` in a test: the repository has no identity (green on macOS, red on Linux CI) - make it with `cloneRepository` / `initializeRepository` of `test/scratch-repository.ts`'

function rawGitFindingsOf(testCase: TestCase): { line: number; message: string }[] {
	return checkCodeRules({
		file: testCase.file,
		text: testCase.text,
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
	})
		.filter((finding) => finding.rule === 'raw-git-repository')
		.map((finding) => ({ line: finding.line, message: finding.message }))
}

describe('raw-git-repository', () => {
	const testCases: Record<string, TestCase> = {
		"git({ root, args: ['clone', ...] }) in a test file → reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "git({ root, args: ['clone', '-q', origin, into] })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"spawnSync('git', ['init', ...]) in a test support file of test/ → reported": {
			file: 'test/land-lot.ts',
			text: "import { spawnSync } from 'node:child_process'\nspawnSync('git', ['init', '-q', root])\n",
			expected: [{ line: 2, message: MESSAGE }],
		},
		'git init --bare in a test → not reported (nothing is committed in a bare repository)': {
			file: 'src/commands/lot-land.test.ts',
			text: "git({ root, args: ['init', '-q', '--bare', '-b', 'main', origin] })\n",
			expected: [],
		},
		'a raw clone in an implementation file → not reported': {
			file: 'src/lib/worktree/add-worktree.ts',
			text: "export function cloneInto() {\n\treturn readGit({ root, args: ['clone', '-q', origin, into] })\n}\n",
			expected: [],
		},
		"an array starting with 'init' outside a git call → not reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "runInit({ argv: ['init', '--yes'] })\n",
			expected: [],
		},
	}

	const entries = Object.entries(testCases)
	const focused = entries.filter(([, testCase]) => testCase.only)
	for (const [title, testCase] of focused.length ? focused : entries)
		it(title, () => {
			expect(rawGitFindingsOf(testCase)).toEqual(testCase.expected)
		})
})
