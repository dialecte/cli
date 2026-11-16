/**
 * The text of a lot's pull request: the lot's own commit message (the first commit lot of the brief in its store
 * folder) as the title, never the branch's last commit - a merge of main or a helper commit would become the squash
 * title on the base branch. A brief with several commit lots squashes into one commit: the others are listed in the body.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { lotsOf } from '../store/brief.ts'
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
	if ('refusal' in messages) return messages
	const [title, ...others] = messages.messages
	const body = LANDING_BODY.replace('{lot}', () => params.lot)
	return {
		title,
		body:
			others.length === 0
				? body
				: [body, '', LANDING_OTHER_MESSAGES, ...others.map((message) => `- ${message}`)].join('\n'),
	}
}

/**
 * The commit messages of the brief at `path`, in order, read through the brief's own reader of its lots; the refusal
 * when the file does not read, or with the reader's reason when its lots do not hold.
 */
function readLotMessages(params: { path: string }): { messages: string[] } | { refusal: string } {
	const { path } = params
	let brief: unknown
	try {
		brief = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return { refusal: LANDING_LINES.noMessage.replace('{brief}', () => path) }
	}
	const { refused, lots } = lotsOf((brief as { lots?: unknown } | null)?.lots)
	if (lots === undefined)
		return {
			refusal: LANDING_LINES.unreadLots
				.replace('{brief}', () => path)
				.replace('{reason}', () => refused[0]?.detail ?? ''),
		}
	return {
		messages: lots.map(function trimmedMessage(lot) {
			return lot.message.trim()
		}),
	}
}
