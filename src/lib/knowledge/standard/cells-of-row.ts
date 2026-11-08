import {
	TABLE_ROW_END_PIPE_PATTERN,
	TABLE_ROW_START_PIPE_PATTERN,
	TABLE_LINE_START,
} from './standard-index.constants.ts'

/** The cells of a table row: the outer pipes removed, split on the inner ones, each trimmed. */
export function cellsOfRow(row: string): string[] {
	const inner = row
		.trim()
		.replace(TABLE_ROW_START_PIPE_PATTERN, '')
		.replace(TABLE_ROW_END_PIPE_PATTERN, '')
	return inner.split(TABLE_LINE_START).map((cell) => cell.trim())
}
