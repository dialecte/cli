import type { CloseTarget } from './handover.types.ts'

/**
 * Each close target as the settle left it, in order: its landed lines (every lot it reaches that landed), why it stays
 * before any decision (a lot target whose lot is open or cannot be read), the tip its lot landed at.
 */
export type CloseSettle = {
	target: CloseTarget
	landed: string[]
	kept?: string
	landedTip?: string
}[]
