import type {
	CheckedCite,
	GivenSlice,
	ManifestFile,
	RangeLine,
	ReportCite,
} from '../src/lib/knowledge/ask/ask.types.ts'

/** A cite of the baseline file, lines 12 to 13 unless said. */
export type CiteOfParams = { quote: string; from?: number; to?: number; file?: string }

/** A cite context over one range: the manifest, the current files and the slices given, each overridable. */
export type CiteContextOfParams = {
	lines: RangeLine[]
	counted?: number
	given?: GivenSlice[]
	current?: ManifestFile[]
}

/** A verified cite of the baseline, ready to hand to `checkClaim`. */
export type VerifiedCiteOfParams = { cite: ReportCite; slice?: GivenSlice }

/** What a verified cite looks like to a claim check. */
export type VerifiedCite = Extract<CheckedCite, { verified: true }>
