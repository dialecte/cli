import { reviewerName } from '../change-request/compose-change-request.ts'
/**
 * A lot's design standing in words (DESIGN-GATE section 4), the same for `lot design`, `lot status`, `lot start`,
 * `lot forecast` and the card: its state, who approved or waived it by kind (never a name), the need's reasons, and
 * what to run next.
 */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	DESIGN_BY_PART,
	DESIGN_NEED_LINES,
	DESIGN_NEXT,
	DESIGN_REASON_SEPARATOR,
	DESIGN_REASON_WORDS,
	DESIGN_REASONS_PART,
	DESIGN_ROSE_PART,
	DESIGN_STATE_WORDS,
	DESIGN_STATUS_LINE,
} from './design.constants.ts'

import type {
	DesignNeed,
	DesignNeedReason,
	DesignStanding,
	DesignStatusJson,
} from './design.types.ts'

/**
 * `design <state>[ by <kind>][ · <reasons>]`.
 *
 * @intent say where a lot's design stands in one line
 * @internal
 */
export function designStatusLine(standing: DesignStanding): string {
	return designJsonLine(designStatusJson(standing))
}

/**
 * The status line of a standing as `--json` prints it, so the text and the JSON say the same.
 *
 * @intent say in one line where a lot's design stands, from its JSON block
 * @internal
 */
export function designJsonLine(json: DesignStatusJson): string {
	const reasons = designReasonsText(json.reasons)
	return fillMessage({
		template: DESIGN_STATUS_LINE,
		values: {
			state: stateTextOf(json),
			reasons:
				reasons === '' ? '' : fillMessage({ template: DESIGN_REASONS_PART, values: { reasons } }),
		},
	})
}

/**
 * `<state>[ by <kind>]`: the state's words and who approved or waived it, by kind.
 *
 * @intent say a lot's design state and who gave its go-ahead, never by name
 * @internal
 */
export function designStateText(standing: DesignStanding): string {
	return stateTextOf(designStatusJson(standing))
}

/** The state's words and the approver's kind. */
function stateTextOf(json: DesignStatusJson): string {
	const by =
		json.by === null ? '' : fillMessage({ template: DESIGN_BY_PART, values: { kind: json.by } })
	return `${DESIGN_STATE_WORDS[json.state]}${by}`
}

/**
 * What to run next for the lot's design; undefined for a state that lets the lot go on.
 *
 * @intent name the command that moves a lot's design forward
 * @internal
 */
export function designNextOf(params: {
	standing: DesignStanding
	lot: string
}): string | undefined {
	const { standing, lot } = params
	const { state } = standing
	if (state !== 'missing' && state !== 'unapproved' && state !== 'stale') return undefined
	const next = fillMessage({
		template: DESIGN_NEXT[state],
		values: { lot, file: standing.file ?? '<file>' },
	})
	if (state === 'stale' || standing.uncovered.length === 0) return next
	return `${fillMessage({ template: DESIGN_ROSE_PART, values: { reasons: designReasonsText(standing.uncovered) } })}${next}`
}

/**
 * The standing as `--json` prints it: the approver or waiver by kind, never by name.
 *
 * @intent give a lot's design standing to a script
 * @internal
 */
export function designStatusJson(standing: DesignStanding): DesignStatusJson {
	return {
		required: standing.need.required,
		reasons: standing.need.reasons,
		state: standing.state,
		by: approverKindOf(standing),
		uncovered: standing.uncovered,
	}
}

/**
 * The reasons in words, joined.
 *
 * @intent say why a lot needs a design
 * @internal
 */
export function designReasonsText(reasons: readonly DesignNeedReason[]): string {
	return reasons
		.map(function wordsOf(reason) {
			return reason.kind === 'shared'
				? fillMessage({ template: DESIGN_REASON_WORDS.shared, values: { glob: reason.glob } })
				: DESIGN_REASON_WORDS.entry
		})
		.join(DESIGN_REASON_SEPARATOR)
}

/** Who approved or waived, by kind (`orchestrator` or `person`); null when nobody did. */
function approverKindOf(standing: DesignStanding): string | null {
	if (standing.by === undefined) return null
	return reviewerName({ kind: 'person', name: standing.by })
}

/**
 * The need as `lot start` says it, before the lot has a name: required with its reasons and what to record, or not.
 *
 * @intent say at a lot's start whether it needs a design, before any code
 * @internal
 */
export function designNeedLine(need: DesignNeed): string {
	return need.required
		? fillMessage({
				template: DESIGN_NEED_LINES.required,
				values: { reasons: designReasonsText(need.reasons) },
			})
		: DESIGN_NEED_LINES.notRequired
}

/**
 * `<state>[ by <kind>][ (<reasons>)]`: the state, who gave its go-ahead and why the lot needs a design, as a refusal
 * names them.
 *
 * @intent say in a refusal where a lot's design stands and why it matters
 * @internal
 */
export function designStateWithReasons(standing: DesignStanding): string {
	const reasons = designReasonsText(standing.need.reasons)
	return `${designStateText(standing)}${reasons === '' ? '' : ` (${reasons})`}`
}
