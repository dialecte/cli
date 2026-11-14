import type { DestructiveGitPair, DestructivePattern } from './risk.types.ts'

/** Calls that delete or move files: an added line of a source file holding one, as a call or a member call, is high risk. */
export const DESTRUCTIVE_CALLS: readonly string[] = [
	'rmSync',
	'rm',
	'unlink',
	'unlinkSync',
	'rmdirSync',
	'rename',
	'renameSync',
	'truncateSync',
]

/**
 * Git arguments that drop work: matched only as quoted text, one string (`'worktree remove'`, `'git reset --hard'`)
 * or consecutive quoted array elements (`'worktree', 'remove'`). `cluster`: the second argument also matches a
 * longer flag that starts with it (`-fd`, `-fdx`, `--force-with-lease`); otherwise only the exact flag.
 */
export const DESTRUCTIVE_GIT_PAIRS: readonly DestructiveGitPair[] = [
	{ first: 'worktree', second: 'remove', cluster: false },
	{ first: 'branch', second: '-D', cluster: false },
	{ first: 'branch', second: '-d', cluster: false },
	{ first: 'reset', second: '--hard', cluster: false },
	{ first: 'clean', second: '-f', cluster: true },
	{ first: 'push', second: '--force', cluster: true },
	{ first: 'checkout', second: '--', cluster: false },
	{ first: 'stash', second: 'drop', cluster: false },
	{ first: 'update-ref', second: '-d', cluster: false },
]

/** What follows a flag of a cluster: more letters or a longer flag name (`-fdx`, `--force-with-lease`). */
const FLAG_CLUSTER_TAIL = '[\\w-]*'

/**
 * Git commands that drop work on their own: matched only as a quoted array element (after `[` or `,`) or as the
 * first word after `git ` inside a quoted string.
 */
export const DESTRUCTIVE_GIT_WORDS: readonly string[] = ['restore']

/** A quote that opens a string of a source line, as a regular expression group. */
const QUOTE = `(['"\`])`

/** Characters a regular expression reads as syntax, escaped when a word is matched as itself. */
export const REGULAR_EXPRESSION_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g

/**
 * The destructive patterns as regular expressions, built once: a call or a member call (`rmSync(`, `.rm(`, never
 * `confirm(`); a git pair as one quoted string, also after `git ` and with more words after it, or as consecutive
 * quoted array elements, a cluster flag with its longer forms; a git word as a quoted array element or the first word after `git ` in a quoted string.
 */
export const DESTRUCTIVE_PATTERNS: readonly DestructivePattern[] = [
	...DESTRUCTIVE_CALLS.map(function callPattern(name): DestructivePattern {
		const word = name.replace(REGULAR_EXPRESSION_SPECIAL_CHARACTERS, '\\$&')
		return { detail: name, expressions: [new RegExp(`(?<![\\w$])${word}\\s*\\(`)] }
	}),
	...DESTRUCTIVE_GIT_PAIRS.map(function pairPattern(pair): DestructivePattern {
		const firstWord = pair.first.replace(REGULAR_EXPRESSION_SPECIAL_CHARACTERS, '\\$&')
		const secondWord = `${pair.second.replace(REGULAR_EXPRESSION_SPECIAL_CHARACTERS, '\\$&')}${pair.cluster ? FLAG_CLUSTER_TAIL : ''}`
		return {
			detail: `${pair.first} ${pair.second}`,
			expressions: [
				new RegExp(`${QUOTE}(?:git\\s+)?${firstWord}\\s+${secondWord}(?=\\s|\\1)`),
				new RegExp(`${QUOTE}${firstWord}\\1\\s*,\\s*${QUOTE}${secondWord}\\2`),
			],
		}
	}),
	...DESTRUCTIVE_GIT_WORDS.map(function wordPattern(name): DestructivePattern {
		const word = name.replace(REGULAR_EXPRESSION_SPECIAL_CHARACTERS, '\\$&')
		return {
			detail: name,
			expressions: [
				new RegExp(`[[,]\\s*${QUOTE}${word}\\1`),
				new RegExp(`${QUOTE}git\\s+${word}(?=\\s|\\1)`),
			],
		}
	}),
]
