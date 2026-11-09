/** The scratch package of the proof-kind fixture and the hashes the cli computes for its case. */
export type ProofKindPackage = {
	root: string
	/** The case's hash now, as the cli records it. */
	caseHash: string
	/** The test file's hash now, as the cli records it. */
	fileHash: string
}
