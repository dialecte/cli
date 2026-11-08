import type { CITATION_WORDS } from './synthetic-standard.constants.ts'

export type CitationWord = keyof typeof CITATION_WORDS

/**
 * One piece of a synthetic standard, turned into original lines. Blocks add no separator of their own:
 * a blank line is a `blank` block, so the line numbers of a case can be counted by hand.
 */
export type SyntheticBlock =
	| { kind: 'blank'; count?: number }
	| { kind: 'raw'; lines: string[] }
	| { kind: 'heading'; number: string; title: string; marker?: string }
	| {
			kind: 'annexHeading'
			letter: string
			title: string
			qualifier?: { text: string; position: 'before' | 'after' }
	  }
	| { kind: 'definition'; number: string; term: string; layout: 'inline' | 'split' }
	| {
			kind: 'caption'
			word: 'table' | 'figure'
			number: string
			title?: string
			separator?: string
	  }
	| { kind: 'table'; columns: string[]; rows: string[][]; withSeparator?: boolean }
	| { kind: 'tocEntry'; number: string; title: string; page: string }
	| { kind: 'oneCharacterRun'; count: number }
	| { kind: 'filler'; count: number }
	| { kind: 'letterSpaced'; text: string }
	| { kind: 'fence'; lines: string[] }
	/**
	 * One line seen again and again: `gaps[i]` is the distance in lines between occurrence i and i + 1,
	 * the lines between them unique filler. `isolated` puts a blank line on each side of every occurrence,
	 * so a prose occurrence is a logical line of its own (every gap is then at least 3).
	 */
	| { kind: 'repeated'; line: string; gaps: number[]; isolated?: boolean }
