/**
 * `dialecte lot describe <id> [--print] [--json]`: the lot's change request rendered from its records through the repository's
 * one template (`src/lib/change-request/`), checked as public text, then sent to its open change request when that reads otherwise:
 * the squash commit on the base branch takes this title and body, so they hold the lot's final state. `--print` sends
 * nothing; a lot without a change request yet prints its text (`lot land` opens it).
 */
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import { prepareChangeRequest } from '../lib/change-request/change-request-sources.ts'
import { CHANGE_REQUEST_LINES } from '../lib/change-request/change-request.constants.ts'
import { composeChangeRequest, linesOf } from '../lib/change-request/compose-change-request.ts'
import { sendWithRecord } from '../lib/change-request/send-with-record.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { hasFlag, positionalArguments } from '../lib/config.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { findBaseBranchRef } from '../lib/gate/gate-base.ts'
import { mainCheckoutOf, readGit } from '../lib/git.ts'
import { readLanding } from '../lib/handover/land-record.ts'
import { createHost, hostNounsOf } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { textOf } from '../lib/print/print.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import {
	LOT_PLACE_LINES,
	LOT_DESCRIBE_LINES,
	LOT_DESCRIBE_VERB,
	LOT_DESCRIBE_OPTIONS,
} from './lot-describe.constants.ts'

import type { ChangeRequestText } from '../lib/change-request/change-request.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { HostAdapter, HostNouns, ChangeRequest } from '../lib/host/host.types.ts'
import type { LotPlace } from './lot-describe.types.ts'

export function runLotDescribe(params: {
	cwd: string
	argv: string[]
	/** Where the change request lives; default: the repository's host. */
	host?: HostAdapter
}): CommandResult {
	const place = lotPlaceOf(params)
	if ('exitCode' in place) return place
	const { lot, lotFolder, worktree, branch, baseRef } = place
	const nouns = hostNounsOf({ root: worktree })
	// the lot's head, else the base's template: a lot cut before the template changed renders as it will land
	const prepared = prepareChangeRequest({
		lotFolder,
		worktree,
		baseRef,
		templateRefs: ['HEAD', baseRef],
	})
	if ('refusal' in prepared)
		return refused({ line: `${LOT_DESCRIBE_LINES.prefix}${prepared.refusal}` })
	const json = hasFlag(params.argv, 'json')
	// the template was checked by `prepareChangeRequest`: composing cannot refuse it
	const fresh = composeChangeRequest({ ...prepared, kept: undefined })
	if ('refusal' in fresh) return refused({ line: `${LOT_DESCRIBE_LINES.prefix}${fresh.refusal}` })
	if (hasFlag(params.argv, 'print')) return printed({ text: fresh, json, sent: false, lines: [] })
	const host = params.host ?? createHost()
	const landing = readLanding({ lotFolder })
	const read = host.readChangeRequest({
		root: worktree,
		ref: landing === undefined ? branch : String(landing.number),
	})
	if (read !== undefined && 'refusal' in read)
		return refused({ line: `${LOT_DESCRIBE_LINES.prefix}${read.refusal}` })
	if (read === undefined)
		return printed({
			text: fresh,
			json,
			sent: false,
			lines: [
				fillMessage({ template: LOT_DESCRIBE_LINES.noChangeRequest, values: { ...nouns, lot } }),
			],
		})
	if (read.state !== 'open')
		return refused({
			line: fillMessage({
				template: LOT_DESCRIBE_LINES.notOpen,
				values: { ...nouns, number: String(read.number), state: read.state },
			}),
		})
	const rendered = sendWithRecord({ host, worktree, lotFolder, prepared, changeRequest: read })
	if ('refusal' in rendered)
		return refused({ line: `${LOT_DESCRIBE_LINES.prefix}${rendered.refusal}` })
	const head = readGit({ root: worktree, args: ['rev-parse', 'HEAD'] }).trim()
	const sent = sentAnswer({ changeRequest: read, ...rendered, json, head, nouns })
	if (json || sent.exitCode !== 0 || read.head === '' || read.head === head) return sent
	return {
		...sent,
		output: textOf([
			...linesOf(sent.output).filter((line) => line !== ''),
			headElsewhereLine({ nouns, changeRequest: read, head, lot }),
		]),
	}
}

/** The line saying the change request is at another head than the lot's, which lot land pushes. */
function headElsewhereLine(params: {
	nouns: HostNouns
	changeRequest: ChangeRequest
	head: string
	lot: string
}): string {
	return fillMessage({
		template: LOT_DESCRIBE_LINES.headElsewhere,
		values: {
			...params.nouns,
			number: String(params.changeRequest.number),
			pushed: params.changeRequest.head.slice(0, SHORT_SHA_LENGTH),
			head: params.head.slice(0, SHORT_SHA_LENGTH),
			lot: params.lot,
		},
	})
}

/**
 * The lot the arguments name, where it lives and the base its change request lands on; the usage or refusal otherwise
 * (an unknown option is a usage error: a mistyped `--print` must never send).
 */
function lotPlaceOf(params: { cwd: string; argv: string[] }): LotPlace | CommandResult {
	const ids = positionalArguments({ argv: params.argv, valueOptions: [] })
	const unknown = params.argv.filter(
		(word) => word.startsWith('-') && !LOT_DESCRIBE_OPTIONS.includes(word),
	)
	if (ids.length !== 1 || unknown.length > 0) return { exitCode: 2, output: renderLotUsage() }
	// a describe that may send writes the lot's sent record: resolved as every writing verb is, --print as a reader
	return resolveLotPlace({
		cwd: params.cwd,
		id: ids[0],
		verb: LOT_DESCRIBE_VERB,
		mode: hasFlag(params.argv, 'print') ? 'read' : 'write',
	})
}

/**
 * The store lot `id` names, where it lives and the base its change request lands on; the refusal (`lot <verb>: ...`)
 * of an id naming none, a damaged lot, one without a worktree, or a base the repository does not name.
 *
 * @intent find a lot's worktree, branch and base for its change request
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
			line: `${prefix}${CHANGE_REQUEST_LINES.worktreeGone.replace('{worktree}', () => worktree)}`,
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

/** The line (or JSON) of a text sent to the open change request, or found the same there. */
function sentAnswer(params: {
	changeRequest: ChangeRequest
	text: ChangeRequestText
	sent: boolean
	json: boolean
	/** The lot's HEAD: the JSON gives it beside the change request's head. */
	head: string
	/** The host's change-request nouns, for the line. */
	nouns: HostNouns
}): CommandResult {
	const { changeRequest, text, sent } = params
	if (params.json)
		return {
			exitCode: 0,
			output: textOf([
				JSON.stringify({
					...text,
					changeRequest: {
						number: changeRequest.number,
						url: changeRequest.url,
						head: changeRequest.head,
					},
					head: params.head,
					sent,
				}),
			]),
		}
	return {
		exitCode: 0,
		output: textOf([
			fillMessage({
				template: sent ? LOT_DESCRIBE_LINES.updated : LOT_DESCRIBE_LINES.unchanged,
				values: { ...params.nouns, number: String(changeRequest.number), url: changeRequest.url },
			}),
		]),
	}
}

/** The rendered text printed (title line, then the body), or as JSON; `lines` after it. */
function printed(params: {
	text: ChangeRequestText
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
			LOT_DESCRIBE_LINES.title.replace('{title}', () => params.text.title),
			'',
			...linesOf(params.text.body),
			...(params.lines.length === 0 ? [] : ['', ...params.lines]),
		]),
	}
}

function refused(params: { line: string; exitCode?: number }): CommandResult {
	return { exitCode: params.exitCode ?? 1, output: textOf([params.line]) }
}
