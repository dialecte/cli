import type { TemporaryFileSeam } from '../src/lib/store/store.types.ts'

/** What a reader of the final name could see at the moment the temporary file was written and not yet published. */
export type ReplacementObservation = {
	/** The temporary file's name is `<final name>.tmp-<pid>-<n>`. */
	temporaryIsOwn: boolean
	/** The temporary file's complete bytes. */
	temporaryBytes: Buffer
	/** The permission bits of the temporary file. */
	temporaryMode: number
	/** The bytes of the final name at that moment; undefined when the name did not exist. */
	finalBytes: Buffer | undefined
}

/** A seam that records one observation per call, for the file `path`. */
export type ReplacementObserver = {
	seam: TemporaryFileSeam
	observations: ReplacementObservation[]
	/** The inode of the temporary file at each call, in the order of `observations`. */
	temporaryInodes: number[]
}
