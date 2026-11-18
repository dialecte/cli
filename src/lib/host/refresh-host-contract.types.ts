/** What `host:refresh` and `host:drift` answer. */
import type { ResolvedBin } from '../bin.types.ts'
import type { FormatFilesParams } from '../format.types.ts'
import type { HostCallTable, HostContract, HostContractRecord, HostRefusal } from './host.types.ts'

/** What a refresh or a drift reads: the repository, the records to ask again, and one vendor's name to keep to. */
export type HostRefreshParams = {
	root: string
	records: readonly HostContractRecord[]
	vendor?: string
	/** Where the formatter is found (default: `resolveBin('oxfmt', …)`); null when there is none. */
	resolveFormatter?: (root: string) => ResolvedBin | null
	/** Formats the record modules (default: `formatFiles`); false when the format failed. */
	format?: (params: FormatFilesParams) => boolean
}

/** A refresh's answer: the files (relative to `root`) whose bytes it changed, or why it wrote nothing. */
export type HostRefreshOutcome = { changed: string[] } | HostRefusal

/** A drift's answer: the exit code (1 when the tool lacks something the table uses) and the lines to print. */
export type HostDriftOutcome = { exit: 0 | 1; lines: string[] }

/** A part of the tool found absent: its version selector and the name it installs under. */
export type HostMissingPart = { selector: string; name: string }

/**
 * What one record's tool described when asked again: the raw answers by fixture name, the contract and versions read
 * out of them, the calls that were asked about (those of an absent part left out), the absent parts, and the reads
 * that failed.
 */
export type HostDescription = {
	files: Readonly<Record<string, string>>
	contract: HostContract
	versions: Readonly<Record<string, string>>
	checked: HostCallTable
	absent: readonly HostMissingPart[]
	refusals: readonly string[]
}

/** What one kind of read gave: the value read out, the raw answers by fixture name, and the reads that failed. */
export type HostReading<Value> = {
	value: Value
	files: Readonly<Record<string, string>>
	refusals: readonly string[]
}
