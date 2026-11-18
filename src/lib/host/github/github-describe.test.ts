/**
 * `flagsOfHelp` reads the flags out of `gh`'s own help texts, saved byte for byte from the real tools (gh 2.104.0,
 * gh-stack 0.3.0): gh's `FLAGS` and `INHERITED FLAGS` with their `[=true|false]` suffixes, and gh-stack's cobra
 * `Flags:`. Both forms of a flag are kept, and each short/long pair is recorded as an alias.
 */
import { readFileSync } from 'node:fs'

import { flagsOfHelp } from './github-describe.ts'

import { describe, expect, it } from 'vitest'

/** A help text saved from the real tool. */
function savedHelp(name: string): string {
	return readFileSync(
		new URL(`../../../../test/fixtures/host-contract/github/${name}`, import.meta.url),
		'utf8',
	)
}

describe('flagsOfHelp on the saved help texts', () => {
	it.each([
		{
			name: 'gh pr merge, the FLAGS and the INHERITED FLAGS',
			help: 'pr-merge.help.txt',
			flags: [
				'--admin',
				'-A',
				'--author-email',
				'--auto',
				'-b',
				'--body',
				'-F',
				'--body-file',
				'-d',
				'--delete-branch',
				'--disable-auto',
				'--match-head-commit',
				'-m',
				'--merge',
				'-r',
				'--rebase',
				'-s',
				'--squash',
				'-t',
				'--subject',
				'--help',
				'-R',
				'--repo',
			],
			aliases: [
				{ short: '-A', long: '--author-email' },
				{ short: '-b', long: '--body' },
				{ short: '-F', long: '--body-file' },
				{ short: '-d', long: '--delete-branch' },
				{ short: '-m', long: '--merge' },
				{ short: '-r', long: '--rebase' },
				{ short: '-s', long: '--squash' },
				{ short: '-t', long: '--subject' },
				{ short: '-R', long: '--repo' },
			],
		},
		{
			name: 'gh api, flags that take a value and flags that take none',
			help: 'api.help.txt',
			flags: [
				'--allow-escape-sequences',
				'--cache',
				'-F',
				'--field',
				'-H',
				'--header',
				'--hostname',
				'-i',
				'--include',
				'--input',
				'-q',
				'--jq',
				'-X',
				'--method',
				'--paginate',
				'-p',
				'--preview',
				'-f',
				'--raw-field',
				'--silent',
				'--slurp',
				'-t',
				'--template',
				'--verbose',
				'--help',
			],
			aliases: [
				{ short: '-F', long: '--field' },
				{ short: '-H', long: '--header' },
				{ short: '-i', long: '--include' },
				{ short: '-q', long: '--jq' },
				{ short: '-X', long: '--method' },
				{ short: '-p', long: '--preview' },
				{ short: '-f', long: '--raw-field' },
				{ short: '-t', long: '--template' },
			],
		},
		{
			name: "gh stack merge, cobra's Flags: (its example line holds flags that are no flag)",
			help: 'stack-merge.help.txt',
			flags: ['-h', '--help', '--merge', '--merge-method', '--rebase', '--squash', '-y', '--yes'],
			aliases: [
				{ short: '-h', long: '--help' },
				{ short: '-y', long: '--yes' },
			],
		},
	])('$name → its flags, short and long, and its aliases', ({ help, flags, aliases }) => {
		expect(flagsOfHelp({ text: savedHelp(help) })).toEqual({ flags, aliases })
	})

	it('a help with no flag section → no flags', () => {
		const text = 'Usage:\n  gh thing [flags]\n\nExamples:\n  $ gh thing --made-up -x\n'

		expect(flagsOfHelp({ text })).toEqual({ flags: [], aliases: [] })
	})
})
