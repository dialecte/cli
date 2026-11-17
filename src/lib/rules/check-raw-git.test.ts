import { applyAllowComments } from './allow-comments.ts'
import { checkCodeRules } from './check-code-rules.ts'
import { RAW_GIT_REPOSITORY_MESSAGE } from './check-raw-git.constants.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	file: string
	text: string
	expected: { line: number; message: string }[]
	only?: boolean
}

const MESSAGE = RAW_GIT_REPOSITORY_MESSAGE

/** The rule's findings left once the file's `dialecte-allow` comments silenced what they cover. */
function rawGitFindingsOf(testCase: TestCase): { line: number; message: string }[] {
	const findings = checkCodeRules({
		file: testCase.file,
		text: testCase.text,
		referencePatterns: GENERIC_REFERENCE_PATTERNS,
	})
	return applyAllowComments({ file: testCase.file, text: testCase.text, findings })
		.findings.filter((finding) => finding.rule === 'raw-git-repository')
		.map((finding) => ({ line: finding.line, message: finding.message }))
}

describe('raw-git-repository', () => {
	const testCases: Record<string, TestCase> = {
		'a shell string on its own line of a call spanning lines → reported on the line of the string':
			{
				file: 'src/commands/lot-land.test.ts',
				text: 'execSync(\n\t`git clone ${origin}\n\t\tinto`,\n)\n',
				expected: [{ line: 2, message: MESSAGE }],
			},
		'a same-file const list referenced on a later line of a call spanning lines → reported on the line of the reference':
			{
				file: 'src/commands/lot-land.test.ts',
				text: "const ARGS = ['clone', '-q', origin, into]\ngit({\n\troot,\n\targs: ARGS,\n})\n",
				expected: [{ line: 4, message: MESSAGE }],
			},
		'a dialecte-allow comment inside a call spanning lines, on the line before the list → not reported':
			{
				file: 'src/commands/lot-land.test.ts',
				text: "git({\n\troot,\n\t// dialecte-allow raw-git-repository: a clone whose missing identity is the case itself\n\targs: ['clone', '-q', origin, into],\n})\n",
				expected: [],
			},
		'a git call spanning lines, its clone list on a later line → reported on the line of the subcommand':
			{
				file: 'src/commands/lot-land.test.ts',
				text: "git({\n\troot,\n\targs: [\n\t\t'clone',\n\t\torigin,\n\t],\n})\n",
				expected: [{ line: 4, message: MESSAGE }],
			},
		"spawnSync('git', ...) spanning lines, its init list on the second line → reported on that line":
			{
				file: 'src/commands/lot-land.test.ts',
				text: "spawnSync(\n\t'git',\n\t['init', '-q', root],\n)\n",
				expected: [{ line: 3, message: MESSAGE }],
			},
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
		"spawnSync('git', ['-C', root, 'init']) in a test → reported (options before the subcommand)": {
			file: 'src/commands/lot-land.test.ts',
			text: "spawnSync('git', ['-C', root, 'init', '-q'])\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"readGit({ root, args: ['clone', ...] }) in a test → reported (the cli's own git readers)": {
			file: 'src/commands/lot-land.test.ts',
			text: "readGit({ root, args: ['clone', '-q', origin, into] })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"git({ root, args: ['-c', 'k=v', 'clone', ...] }) in a test → reported (-c takes its value)": {
			file: 'src/commands/lot-land.test.ts',
			text: "git({ root, args: ['-c', 'protocol.file.allow=always', 'clone', origin, into] })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"tryReadGit({ root, args: ['init'] }) in a test → reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "tryReadGit({ root, args: ['init', '-q'] })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"readGitBytes({ root, args: ['clone', ...] }) in a test → reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "readGitBytes({ root, args: ['clone', '-q', origin, into] })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"execFileSync('git', ['clone', ...]) in a test → reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "execFileSync('git', ['clone', '-q', origin, into])\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"spawn('git', ['init', ...]) in a test → reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "spawn('git', ['init', '-q', root])\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		'git clone --bare in a test → not reported (nothing is committed in a bare repository)': {
			file: 'src/commands/lot-land.test.ts',
			text: "git({ root, args: ['clone', '-q', '--bare', origin, into] })\n",
			expected: [],
		},
		'git clone --mirror in a test → reported (a mirror is no bare clone the rule exempts)': {
			file: 'src/commands/lot-land.test.ts',
			text: "git({ root, args: ['clone', '-q', '--mirror', origin, into] })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		'a raw init in a test file deep under src → reported': {
			file: 'src/lib/worktree/add-worktree.test.ts',
			text: "git({ root, args: ['init', '-q'] })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"execSync('git init ...') in a test → reported (a shell string)": {
			file: 'src/commands/lot-land.test.ts',
			text: "execSync('git init -q -b main', { cwd: root })\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		'execSync(`git clone ${origin} into`) in a test → reported (a shell template)': {
			file: 'src/commands/lot-land.test.ts',
			text: 'execSync(`git clone -q ${origin} into`)\n',
			expected: [{ line: 1, message: MESSAGE }],
		},
		"spawnSync('git -C dir init', { shell: true }) in a test → reported (a shell string after options)":
			{
				file: 'src/commands/lot-land.test.ts',
				text: "spawnSync('git -C dir init -q', { shell: true })\n",
				expected: [{ line: 1, message: MESSAGE }],
			},
		"execSync('git init --bare ...') in a test → not reported (a bare shell init)": {
			file: 'src/commands/lot-land.test.ts',
			text: "execSync('git init -q --bare origin')\n",
			expected: [],
		},
		"spawnSync('git', ['--git-dir', dir, 'init']) in a test → reported (--git-dir takes its value)":
			{
				file: 'src/commands/lot-land.test.ts',
				text: "spawnSync('git', ['--git-dir', dir, '--work-tree', tree, 'init', '-q'])\n",
				expected: [{ line: 1, message: MESSAGE }],
			},
		"spawnSync('git', ['--git-dir=x', 'init']) in a test → reported (the one-element form)": {
			file: 'src/commands/lot-land.test.ts',
			text: "spawnSync('git', ['--git-dir=x', 'init', '-q'])\n",
			expected: [{ line: 1, message: MESSAGE }],
		},
		"spawnSync(GIT, ['init']) with a same-file const GIT = 'git' → reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "const GIT = 'git'\nspawnSync(GIT, ['init', '-q', root])\n",
			expected: [{ line: 2, message: MESSAGE }],
		},
		"git({ root, args: ARGS }) with a same-file const ARGS = ['clone', ...] → reported": {
			file: 'src/commands/lot-land.test.ts',
			text: "const ARGS = ['clone', '-q', origin, into]\ngit({ root, args: ARGS })\n",
			expected: [{ line: 2, message: MESSAGE }],
		},
		'a raw clone under a dialecte-allow raw-git-repository comment → not reported': {
			file: 'src/commands/lot-land.test.ts',
			text: "// dialecte-allow raw-git-repository: a clone whose missing identity is the case itself\ngit({ root, args: ['clone', '-q', origin, into] })\n",
			expected: [],
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

	it('a dialecte-allow comment above a call spanning lines, its list three lines lower → still reported, the comment unused', () => {
		const file = 'src/commands/lot-land.test.ts'
		const text =
			"// dialecte-allow raw-git-repository: a clone whose missing identity is the case itself\ngit({\n\troot,\n\targs: ['clone', '-q', origin, into],\n})\n"
		const findings = checkCodeRules({ file, text, referencePatterns: GENERIC_REFERENCE_PATTERNS })

		const left = applyAllowComments({ file, text, findings }).findings

		expect(left.map((finding) => ({ rule: finding.rule, line: finding.line }))).toEqual([
			{ rule: 'unused-allow', line: 1 },
			{ rule: 'raw-git-repository', line: 4 },
		])
	})
})
