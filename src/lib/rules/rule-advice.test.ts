/**
 * A rule's advice fits the package it runs in: the cli's own helpers are named only when the checked package is the
 * cli; in core or a dialecte the same finding states the rule and why, naming no helper that is not there.
 */
import { createScratchRepository, isolateGitConfig } from '../../../test/scratch-repository.ts'
import { BARE_TMPDIR_CLI_MESSAGE, BARE_TMPDIR_MESSAGE } from './check-code-rules.constants.ts'
import {
	RAW_GIT_REPOSITORY_CLI_MESSAGE,
	RAW_GIT_REPOSITORY_MESSAGE,
} from './check-raw-git.constants.ts'
import { checkRules } from './check-rules.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** The cli's own helpers: named in a finding of the cli, never in one of another package. */
const CLI_HELPER_PATTERN =
	/makeScratchFolder|src\/lib\/scratch|cloneRepository|initializeRepository|scratch-repository/

/** A production file making a folder in the system's temporary folder itself. */
const TMPDIR_FILE = 'src/store/hub.ts'
const TMPDIR_TEXT =
	"import { mkdtempSync } from 'node:fs'\nimport { tmpdir } from 'node:os'\nimport { join } from 'node:path'\n\nexport function makeFolder(): string {\n\treturn mkdtempSync(join(tmpdir(), 'hub-'))\n}\n"

/** A test making a git repository itself. */
const RAW_GIT_FILE = 'src/store/hub.test.ts'
const RAW_GIT_TEXT =
	"import { execFileSync } from 'node:child_process'\n\nexecFileSync('git', ['init', '-q', root])\n"

/**
 * The files that make each package kind: the cli and core by their name, a dialecte by the generated definition its
 * `src` holds (a contributor's package each, so every file is judged).
 */
const PACKAGES = {
	cli: { 'package.json': packageJsonOf('@dialecte/cli') },
	core: { 'package.json': packageJsonOf('@dialecte/core') },
	dialecte: {
		'package.json': packageJsonOf('@dialecte/demo'),
		'src/definition.generated.ts': 'export const DEFINITION = {}\n',
	},
}

type TestCase = {
	package: keyof typeof PACKAGES
	rule: 'bare-tmpdir' | 'raw-git-repository'
	file: string
	text: string
	expected: { message: string; namesCliHelper: boolean }
	only?: boolean
}

afterEach(() => vi.unstubAllEnvs())

/** A contributor package's package.json named `name`. */
function packageJsonOf(name: string): string {
	return `${JSON.stringify({ name, dialecte: { profile: 'contributor' } })}\n`
}

/** The messages of the case's rule, the file checked in a package of the case's kind. */
function messagesOf(testCase: TestCase): { message: string; namesCliHelper: boolean }[] {
	isolateGitConfig()
	const root = createScratchRepository({
		...PACKAGES[testCase.package],
		[testCase.file]: testCase.text,
	})
	return checkRules({ root, givenFiles: [testCase.file], environment: process.env })
		.findings.filter((finding) => finding.rule === testCase.rule)
		.map((finding) => ({
			message: finding.message,
			namesCliHelper: CLI_HELPER_PATTERN.test(finding.message),
		}))
}

describe('rule advice fits the checked package', () => {
	const testCases: Record<string, TestCase> = {
		'bare-tmpdir in the cli → names makeScratchFolder': {
			package: 'cli',
			rule: 'bare-tmpdir',
			file: TMPDIR_FILE,
			text: TMPDIR_TEXT,
			expected: { message: BARE_TMPDIR_CLI_MESSAGE, namesCliHelper: true },
		},
		'bare-tmpdir in core → the rule and why, no cli helper': {
			package: 'core',
			rule: 'bare-tmpdir',
			file: TMPDIR_FILE,
			text: TMPDIR_TEXT,
			expected: { message: BARE_TMPDIR_MESSAGE, namesCliHelper: false },
		},
		'bare-tmpdir in a dialecte → the rule and why, no cli helper': {
			package: 'dialecte',
			rule: 'bare-tmpdir',
			file: TMPDIR_FILE,
			text: TMPDIR_TEXT,
			expected: { message: BARE_TMPDIR_MESSAGE, namesCliHelper: false },
		},
		'raw-git-repository in the cli → names the scratch repository helpers': {
			package: 'cli',
			rule: 'raw-git-repository',
			file: RAW_GIT_FILE,
			text: RAW_GIT_TEXT,
			expected: { message: RAW_GIT_REPOSITORY_CLI_MESSAGE, namesCliHelper: true },
		},
		'raw-git-repository in core → the rule and why, no cli helper': {
			package: 'core',
			rule: 'raw-git-repository',
			file: RAW_GIT_FILE,
			text: RAW_GIT_TEXT,
			expected: { message: RAW_GIT_REPOSITORY_MESSAGE, namesCliHelper: false },
		},
		'raw-git-repository in a dialecte → the rule and why, no cli helper': {
			package: 'dialecte',
			rule: 'raw-git-repository',
			file: RAW_GIT_FILE,
			text: RAW_GIT_TEXT,
			expected: { message: RAW_GIT_REPOSITORY_MESSAGE, namesCliHelper: false },
		},
	}

	it.each(Object.entries(testCases))('%s', (_name, testCase) => {
		expect(messagesOf(testCase)).toEqual([testCase.expected])
	})
})
