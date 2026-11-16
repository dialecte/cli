/**
 * The text of a lot's pull request: the lot's own commit message (the first commit lot of the brief in its store
 * folder) as the title, never the branch's last commit - a merge of main or a helper commit would become the squash
 * title on the base branch. A brief with several commit lots squashes into one commit: the others are listed in the body.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FILES } from '../store/store.constants.ts'
import { LANDING_BODY, LANDING_LINES, LANDING_OTHER_MESSAGES } from './land-lot.constants.ts'

import type { PullRequestText } from './land-lot.types.ts'

/** The pull request text of the lot whose store folder is `lotFolder`, or the refusal when its brief names no message. */
export function pullRequestTextOf(params: {
	lot: string
	lotFolder: string
}): PullRequestText | { refusal: string } {
	const path = join(params.lotFolder, STORE_FILES.brief)
	const messages = readLotMessages({ path })
	if (messages === undefined)
		return { refusal: LANDING_LINES.noMessage.replace('{brief}', () => path) }
	const [title, ...others] = messages
	const body = LANDING_BODY.replace('{lot}', () => params.lot)
	return {
		title,
		body:
			others.length === 0
				? body
				: [body, '', LANDING_OTHER_MESSAGES, ...others.map((message) => `- ${message}`)].join('\n'),
	}
}

/** The commit messages of the brief at `path`, in order; undefined when it does not read or a lot has no message. */
function readLotMessages(params: { path: string }): string[] | undefined {
	let brief: unknown
	try {
		brief = JSON.parse(readFileSync(params.path, 'utf8'))
	} catch {
		return undefined
	}
	const lots = (brief as { lots?: unknown } | null)?.lots
	if (!Array.isArray(lots) || lots.length === 0) return undefined
	const messages = lots.map((lot) => (lot as { message?: unknown } | null)?.message)
	return messages.every(isMessage) ? messages.map((message) => message.trim()) : undefined
}

function isMessage(message: unknown): message is string {
	return typeof message === 'string' && message.trim() !== ''
}
