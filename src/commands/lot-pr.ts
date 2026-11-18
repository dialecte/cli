/**
 * `dialecte lot pr <id> [--print] [--json]`: the lot's pull request rendered from its records through the repository's
 * one template (`src/lib/pr/`), checked as public text, then sent to its open pull request when that reads otherwise:
 * the squash commit on the base branch takes this title and body, so they hold the lot's final state. `--print` sends
 * nothing; a lot without a pull request yet prints its text (`lot land` opens it).
 */
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { findBaseBranchRef } from '../lib/gate/gate-base.ts'
import { mainCheckoutOf, readGit } from '../lib/git.ts'
import { readLanding } from '../lib/handover/land-record.ts'
import { createGithubHost } from '../lib/host/github-host.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { composePullRequest, keptPartOf, linesOf } from '../lib/pr/compose-pull-request.ts'
import { preparePullRequest } from '../lib/pr/pull-request-sources.ts'
import { PULL_REQUEST_LINES } from '../lib/pr/pull-request.constants.ts'
import { textOf } from '../lib/print/print.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { LOT_PLACE_LINES, LOT_PR_LINES, LOT_PR_OPTIONS } from './lot-pr.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter, PullRequest } from '../lib/host/host.types.ts'
import type { PreparedPullRequest, PullRequestText } from '../lib/pr/pull-request.types.ts'
import type { LotPlace } from './lot-pr.types.ts'

export function runLotPr(params: {
	cwd: string
	argv: string[]
	/** Where the pull request lives; default: GitHub through `gh`. */
	host?: HostAdapter
}): CommandResult {
	const place = lotPlaceOf(params)
	if ('exitCode' in place) return place
	const { lot, lotFolder, worktree, branch, baseRef } = place
	// the lot's head, else the base's template: a lot cut before the template changed renders as it will land
	const prepared = preparePullRequest({
		lotFolder,
		worktree,
		baseRef,
		templateRefs: ['HEAD', baseRef],
	})
	if ('refusal' in prepared) return refused({ line: `${LOT_PR_LINES.prefix}${prepared.refusal}` })
	const json = hasFlag(params.argv, 'json')
	// the template was checked by `preparePullRequest`: composing cannot refuse it
	const fresh = composePullRequest({ ...prepared, kept: undefined })
	if ('refusal' in fresh) return refused({ line: `${LOT_PR_LINES.prefix}${fresh.refusal}` })
	if (hasFlag(params.argv, 'print')) return printed({ text: fresh, json, sent: false, lines: [] })
	const host = params.host ?? createGithubHost()
	const landing = readLanding({ lotFolder })
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
	const rendered = sendRenderedText({ host, worktree, prepared, pullRequest: read })
	if ('refusal' in rendered) return refused({ line: `${LOT_PR_LINES.prefix}${rendered.refusal}` })
	const head = readGit({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const sent = sentAnswer({ pullRequest: read, ...rendered, json, head })
	if (json || sent.exitCode !== 0 || read.head === '' || read.head === head) return sent
	return {
		...sent,
		output: textOf([
			...linesOf(sent.output).filter((line) => line !== ''),
			LOT_PR_LINES.headElsewhere
				.replace('{number}', String(read.number))
				.replace('{pushed}', read.head.slice(0, SHORT_SHA_LENGTH))
				.replace('{head}', head.slice(0, SHORT_SHA_LENGTH))
				.replace('{lot}', () => lot),
		]),
	}
}

/**
 * The lot the arguments name, where it lives and the base its pull request lands on; the usage or refusal otherwise
 * (an unknown option is a usage error: a mistyped `--print` must never send).
 */
function lotPlaceOf(params: { cwd: string; argv: string[] }): LotPlace | CommandResult {
	const ids = positionalArguments({ argv: params.argv, valueOptions: [] })
	const unknown = params.argv.filter(
		(word) => word.startsWith('-') && !LOT_PR_OPTIONS.includes(word),
	)
	if (ids.length !== 1 || unknown.length > 0) return { exitCode: 2, output: renderLotUsage() }
	return resolveLotPlace({ cwd: params.cwd, id: ids[0], verb: 'pr', mode: 'read' })
}

/**
 * The store lot `id` names, where it lives and the base its pull request lands on; the refusal (`lot <verb>: ...`)
 * of an id naming none, a damaged lot, one without a worktree, or a base the repository does not name.
 *
 * @intent find a lot's worktree, branch and base for its pull request
 * @internal
 */
export function resolveLotPlace(params: {
	cwd: string
	id: string
	verb: string
	mode: 'read' | 'write'
}): LotPlace | CommandResult {
	const { id, verb } = params
	const prefix = LOT_PLACE_LINES.prefix.replace('{verb}', verb)
	const required = requiredLotOf({ argument: id, cwd: params.cwd, mode: params.mode })
	if (!('lot' in required)) return { exitCode: 2, output: textOf(required.lines) }
	const checked = readCheckedLotState({
		lotFolder: required.lot,
		registry: registryOfLotFolder(required.lot),
	})
	if (checked === undefined || !('input' in checked))
		return refused({
			line: `${prefix}${LOT_PLACE_LINES.damaged.replaceAll('{lot}', () => basename(required.lot))}`,
		})
	const identity = readIdentity({ lotFolder: required.lot })
	if (identity === undefined || identity.worktree === null)
		return refused({
			line: `${prefix}${LOT_PLACE_LINES.noWorktree.replace('{lot}', () => id)}`,
			exitCode: 2,
		})
	const { worktree, branch } = identity
	if (!existsSync(worktree))
		return refused({
			line: `${prefix}${PULL_REQUEST_LINES.worktreeGone.replace('{worktree}', () => worktree)}`,
		})
	const main = mainCheckoutOf(worktree)
	const base = findBaseBranchRef({ root: main, packageJson: readPackageJson(main) })
	if ('refusal' in base) return refused({ line: `${prefix}${base.refusal}` })
	return {
		lot: basename(required.lot),
		lotFolder: required.lot,
		worktree,
		branch,
		baseRef: base.ref,
		state: lotState(checked.input).state,
	}
}

/**
 * The open pull request's title and body rendered again from `prepared` (a person's part after the kept marker kept)
 * and sent when they read otherwise; the text and whether it was sent, or the refusal of the render or the host.
 *
 * @intent keep an open pull request's text the lot's records
 * @internal
 */
export function sendRenderedText(params: {
	host: HostAdapter
	worktree: string
	prepared: PreparedPullRequest
	pullRequest: PullRequest
}): { text: PullRequestText; sent: boolean } | { refusal: string } {
	const { prepared, pullRequest } = params
	const kept = keptPartOf({ template: prepared.template, body: pullRequest.body })
	if ('refusal' in kept) return kept
	const text = composePullRequest({ ...prepared, kept: kept.kept })
	if ('refusal' in text) return text
	const same =
		pullRequest.title === text.title && linesOf(pullRequest.body).join('\n') === text.body
	if (same) return { text, sent: false }
	const edited = params.host.editPullRequest({
		root: params.worktree,
		number: pullRequest.number,
		...text,
	})
	return edited ?? { text, sent: true }
}

/** The line (or JSON) of a text sent to the open pull request, or found the same there. */
function sentAnswer(params: {
	pullRequest: PullRequest
	text: PullRequestText
	sent: boolean
	json: boolean
	/** The lot's HEAD: the JSON gives it beside the pull request's head. */
	head: string
}): CommandResult {
	const { pullRequest, text, sent } = params
	if (params.json)
		return {
			exitCode: 0,
			output: textOf([
				JSON.stringify({
					...text,
					pullRequest: {
						number: pullRequest.number,
						url: pullRequest.url,
						head: pullRequest.head,
					},
					head: params.head,
					sent,
				}),
			]),
		}
	return {
		exitCode: 0,
		output: textOf([
			(sent ? LOT_PR_LINES.updated : LOT_PR_LINES.unchanged)
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
			...linesOf(params.text.body),
			...(params.lines.length === 0 ? [] : ['', ...params.lines]),
		]),
	}
}

function refused(params: { line: string; exitCode?: number }): CommandResult {
	return { exitCode: params.exitCode ?? 1, output: textOf([params.line]) }
}
