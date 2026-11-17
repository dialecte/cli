/**
 * The manifest's globs, read as the licence review wrote them (Python's `fnmatch`): `*` stands for any characters,
 * `/` included; `?` for one character; `[seq]` and `[!seq]` for one character in or out of the set; every other
 * character is itself. Not `tdd/match-glob.ts`, whose `*` stops at `/`: the same manifest must build the same tree.
 */
import { FNMATCH_SPECIAL_PATTERN } from './corpus.constants.ts'

export function fnmatches(params: { path: string; pattern: string }): boolean {
	return expressionOf(params.pattern).test(params.path)
}

/** Whether `path` matches one of `patterns`. */
export function fnmatchesAny(params: { path: string; patterns: readonly string[] }): boolean {
	return params.patterns.some((pattern) => fnmatches({ path: params.path, pattern }))
}

function expressionOf(pattern: string): RegExp {
	let source = ''
	let index = 0
	while (index < pattern.length) {
		const character = pattern[index]
		index++
		if (character === '*') source += '.*'
		else if (character === '?') source += '.'
		else if (character === '[') {
			const close = classEnd({ pattern, start: index })
			if (close === undefined) source += '\\['
			else {
				source += classSource(pattern.slice(index, close))
				index = close + 1
			}
		} else source += character.replace(FNMATCH_SPECIAL_PATTERN, '\\$&')
	}
	return new RegExp(`^${source}$`, 'su')
}

/** The index of the `]` closing a class opened before `start`, as fnmatch reads it (a first `!` or `]` is part of it). */
function classEnd(params: { pattern: string; start: number }): number | undefined {
	let index = params.start
	if (params.pattern[index] === '!') index++
	if (params.pattern[index] === ']') index++
	const close = params.pattern.indexOf(']', index)
	return close === -1 ? undefined : close
}

function classSource(inside: string): string {
	const negated = inside.startsWith('!')
	const body = (negated ? inside.slice(1) : inside)
		.replaceAll('\\', '\\\\')
		.replaceAll(']', '\\]')
		.replaceAll('^', '\\^')
	return `[${negated ? '^' : ''}${body}]`
}
