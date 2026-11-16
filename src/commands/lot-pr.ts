/**
 * `dialecte lot pr <id> [--print] [--json]`: the lot's pull request rendered from its records through the repository's
 * one template (`src/lib/pr/`), checked as public text, then sent to its open pull request when that reads otherwise:
 * the squash commit on the base branch takes this title and body, so they hold the lot's final state. `--print` sends
 * nothing; a lot without a pull request yet prints its text (`lot land --draft` opens it).
 */
import { basename } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { findBaseBranchRef } from '../lib/gate/gate-base.ts'
import { mainCheckoutOf } from '../lib/git.ts'
import { readLanding } from '../lib/handover/land-record.ts'
import { createGithubHost } from '../lib/host/github-host.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { composePullRequest, keptTextOf } from '../lib/pr/compose-pull-request.ts'
import { preparePullRequest } from '../lib/pr/pull-request-sources.ts'
import { textOf } from '../lib/print/print.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { LOT_PR_LINES } from './lot-pr.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter, PullRequest } from '../lib/host/host.types.ts'
import type { PullRequestText } from '../lib/pr/pull-request.types.ts'

export function runLotPr(params: {
	cwd: string
	argv: string[]
	/** Where the pull request lives; default: GitHub through `gh`. */
	host?: HostAdapter
}): CommandResult {
	const ids = positionalArguments({ argv: params.argv, valueOptions: [] })
	if (ids.length !== 1) return { exitCode: 2, output: renderLotUsage() }
	const required = requiredLotOf({ argument: ids[0], cwd: params.cwd, mode: 'read' })
	if (!('lot' in required)) return { exitCode: 2, output: textOf(required.lines) }
	const lot = basename(required.lot)
	const identity = readIdentity({ lotFolder: required.lot })
	if (identity === undefined || identity.worktree === null)
		return refused({ line: LOT_PR_LINES.noWorktree.replace('{lot}', () => ids[0]), exitCode: 2 })
	const { worktree, branch } = identity
	const main = mainCheckoutOf(worktree)
	const base = findBaseBranchRef({ root: main, packageJson: readPackageJson(main) })
	if ('refusal' in base) return refused({ line: `${LOT_PR_LINES.prefix}${base.refusal}` })
	const prepared = preparePullRequest({ lotFolder: required.lot, worktree, baseRef: base.ref })
	if ('refusal' in prepared) return refused({ line: `${LOT_PR_LINES.prefix}${prepared.refusal}` })
	const json = hasFlag(params.argv, 'json')
	// the template was checked by `preparePullRequest`: composing cannot refuse it
	const fresh = composePullRequest({ ...prepared, kept: undefined })
	if ('refusal' in fresh) return refused({ line: `${LOT_PR_LINES.prefix}${fresh.refusal}` })
	if (hasFlag(params.argv, 'print')) return printed({ text: fresh, json, sent: false, lines: [] })
	const host = params.host ?? createGithubHost()
	const landing = readLanding({ lotFolder: required.lot })
	const read = host.readPullRequest({
		root: worktree,
		ref: landing === undefined ? branch : String(landing.number),
	})
	if (read !== undefined && 'refusal' in read)
		return refused({ line: `${LOT_PR_LINES.prefix}${read.refusal}` })
	if (read === undefined)
		return printed({
			text: fresh,
			json,
			sent: false,
			lines: [LOT_PR_LINES.noPullRequest.replace('{lot}', () => lot)],
		})
	if (read.state !== 'open')
		return refused({
			line: LOT_PR_LINES.notOpen
				.replace('{number}', String(read.number))
				.replace('{state}', read.state),
		})
	const text = composePullRequest({
		...prepared,
		kept: keptTextOf({ template: prepared.template, body: read.body ?? '' }),
	})
	if ('refusal' in text) return refused({ line: `${LOT_PR_LINES.prefix}${text.refusal}` })
	return sendText({ host, worktree, pullRequest: read, text, json })
}

/** The text sent to the open pull request when it reads otherwise; its line (or JSON) either way. */
function sendText(params: {
	host: HostAdapter
	worktree: string
	pullRequest: PullRequest
	text: PullRequestText
	json: boolean
}): CommandResult {
	const { pullRequest, text } = params
	const same = pullRequest.title === text.title && pullRequest.body === text.body
	if (!same) {
		const edited = params.host.editPullRequest({
			root: params.worktree,
			number: pullRequest.number,
			...text,
		})
		if (edited !== undefined) return refused({ line: `${LOT_PR_LINES.prefix}${edited.refusal}` })
	}
	if (params.json)
		return {
			exitCode: 0,
			output: textOf([
				JSON.stringify({
					...text,
					pullRequest: { number: pullRequest.number, url: pullRequest.url },
					sent: !same,
				}),
			]),
		}
	return {
		exitCode: 0,
		output: textOf([
			(same ? LOT_PR_LINES.unchanged : LOT_PR_LINES.updated)
				.replace('{number}', String(pullRequest.number))
				.replace('{url}', () => pullRequest.url),
		]),
	}
}

/** The rendered text printed (title line, then the body), or as JSON; `lines` after it. */
function printed(params: {
	text: PullRequestText
	json: boolean
	sent: boolean
	lines: string[]
}): CommandResult {
	if (params.json)
		return {
			exitCode: 0,
			output: textOf([JSON.stringify({ ...params.text, sent: params.sent })]),
		}
	return {
		exitCode: 0,
		output: textOf([
			LOT_PR_LINES.title.replace('{title}', () => params.text.title),
			'',
			params.text.body,
			...(params.lines.length === 0 ? [] : ['', ...params.lines]),
		]),
	}
}

function refused(params: { line: string; exitCode?: number }): CommandResult {
	return { exitCode: params.exitCode ?? 1, output: textOf([params.line]) }
}
