/**
 * A change request's line comments as findings of the lot's ledger (`lot review --comments`): a thread's first
 * comment only (a reply discusses it), each once (`pulled-comments.jsonl` holds the comments already pulled).
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendLine } from '../events/write-event.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { appendFinding } from './findings-ledger.ts'
import {
	COMMENT_SEVERITY_PATTERN,
	DEFAULT_COMMENT_SEVERITY,
	ORPHAN_FINDING_REFUSAL,
	PULLED_LINE_SCHEMA,
} from './review-comments.constants.ts'
import { LEDGER_FILE, SEVERITY_SPELLINGS } from './review-rounds.constants.ts'

import type { ReviewComment } from '../host/host.types.ts'
import type { CommentFinding, PulledLine } from './review-comments.types.ts'

/**
 * The comments of `number` not pulled into the folder yet, threads' first comments only, each as a finding: the
 * severity from a leading `blocking:` / `should-fix:` / `nit:` (dropped from the text), else should-fix; at its
 * `path:line` (the path alone for a comment on the file); its lines joined into one (a comment of its severity word
 * alone keeps it as its text).
 *
 * @intent turn a pull request's review comments into a lot's findings
 * @internal
 */
export function newCommentFindings(params: {
	folder: string
	number: number
	comments: readonly ReviewComment[]
}): CommentFinding[] {
	const pulled = pulledComments({ folder: params.folder, number: params.number })
	return params.comments
		.filter((comment) => comment.replyTo === undefined && !pulled.has(comment.id))
		.map(function findingOf(comment) {
			const severity = COMMENT_SEVERITY_PATTERN.exec(comment.body)
			const text = oneLine(comment.body.replace(COMMENT_SEVERITY_PATTERN, ''))
			return {
				comment: comment.id,
				severity:
					severity === null
						? DEFAULT_COMMENT_SEVERITY
						: severity[1].toLowerCase().replace(' ', '-'),
				at: comment.line === undefined ? comment.path : `${comment.path}:${comment.line}`,
				// a comment of its severity alone keeps its words: a finding is never empty
				finding: text === '' ? oneLine(comment.body) : text,
			}
		})
}

/**
 * Each finding appended to the folder's ledger in `round`, then its comment to `pulled-comments.jsonl`, one after the
 * other: the ids given, in order, and the reason a write failed (the findings after it not written). A finding written
 * whose comment could not be marked is named in that reason: a next pull adds it again.
 *
 * @intent record a pull request's comments as a lot's findings
 * @internal
 */
export function recordCommentFindings(params: {
	folder: string
	number: number
	round: number
	findings: readonly CommentFinding[]
	now: Date
}): { ids: string[]; refusal?: string } {
	const { folder } = params
	const ids: string[] = []
	for (const finding of params.findings) {
		let id: string | undefined
		try {
			id = appendFinding({
				path: join(folder, LEDGER_FILE),
				title: basename(folder),
				round: params.round,
				severity: SEVERITY_SPELLINGS[finding.severity],
				at: finding.at,
				finding: finding.finding,
			})
			const line: PulledLine = {
				schema: PULLED_LINE_SCHEMA,
				at: params.now.toISOString(),
				number: params.number,
				comment: finding.comment,
				finding: id,
			}
			appendLine({
				file: join(folder, STORE_FILES.pulledComments),
				line: Buffer.from(`${JSON.stringify(line)}\n`, 'utf8'),
				limit: EVENT_LINE_LIMIT,
			})
			ids.push(id)
		} catch (error) {
			const reason = (error as Error).message
			// a finding written whose comment is not marked: named, as a next pull adds it again
			return {
				ids,
				refusal:
					id === undefined
						? reason
						: fillMessage({
								template: ORPHAN_FINDING_REFUSAL,
								values: { id, comment: String(finding.comment), reason },
							}),
			}
		}
	}
	return { ids }
}

/** The text on one line: its lines joined by a space, trimmed. */
function oneLine(text: string): string {
	return text
		.split(/\s*\n\s*/)
		.join(' ')
		.trim()
}

/** The comment ids of `number` the folder pulled already; a line that does not read is skipped. */
function pulledComments(params: { folder: string; number: number }): Set<number> {
	const file = join(params.folder, STORE_FILES.pulledComments)
	if (!existsSync(file)) return new Set()
	const ids = new Set<number>()
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		try {
			const parsed = JSON.parse(line) as Partial<PulledLine>
			if (parsed.number === params.number && typeof parsed.comment === 'number')
				ids.add(parsed.comment)
		} catch {
			continue
		}
	}
	return ids
}
