/** The texts and options of `dialecte lot risk` (33L1 section 3, D12, D18, D29). */
import { DAMAGED_TEXTS } from '../lib/store/store.constants.ts'

/** The one usage line of `lot risk`, for every usage fault. */
export const LOT_RISK_USAGE =
	'lot risk: expected <id|folder> [--json] or <id|folder> --effort low|medium|high [--class high|medium|light] --by <who> [--reason <text>]'

/** The options `lot risk` takes followed by a value, without the dashes. */
export const LOT_RISK_VALUE_OPTIONS = ['effort', 'class', 'by', 'reason'] as const

/** The flags `lot risk` takes, without the dashes. */
export const LOT_RISK_FLAGS = ['json'] as const

/** The option that makes `lot risk` write (mode `write` for the folder word). */
export const LOT_RISK_EFFORT_OPTION = '--effort'

/** The options that only go with `--effort`, without the dashes. */
export const LOT_RISK_WRITE_ONLY_OPTIONS = ['class', 'by', 'reason'] as const

/** The verb `lot risk` names in its lines and its forbidden-word refusal. */
export const LOT_RISK_VERB = 'risk'

/** The first line of a read. */
export const LOT_RISK_HEAD = 'lot risk: class {class} · effort {effort} · cap {cap}'

/** The class word of a read whose class cannot be derived nor read. */
export const LOT_RISK_UNKNOWN_CLASS = 'unknown'

/** The effort word of a read with no effort recorded. */
export const LOT_RISK_NO_EFFORT = 'none recorded'

/** The indent of a reason line. */
export const LOT_RISK_REASON_INDENT = '  '

/** An effort recorded. */
export const LOT_RISK_RECORDED = 'lot risk: effort {effort} recorded by {by} - {file}'

/** The last effort line already holds the same effort and class: nothing appended. */
export const LOT_RISK_ALREADY = 'lot risk: effort {effort} already recorded - {file}'

/** An effort below the class without a reason. */
export const LOT_RISK_BELOW_REFUSAL =
	'lot risk: effort {effort} is below risk class {class}: add --reason <text>'

/** A damaged store lot, refused by the read and the write alike: the shared damaged text after the verb. */
export const LOT_RISK_DAMAGED_REFUSAL = `lot risk: ${DAMAGED_TEXTS.state}`

/** A store lot in a terminal state. */
export const LOT_RISK_TERMINAL_REFUSAL = 'lot risk: {name} is {state}: nothing to record'

/** A failed append. */
export const LOT_RISK_WRITE_FAILURE = 'lot risk: {message}'
