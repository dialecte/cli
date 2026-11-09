/**
 * A scratch vitest package holding one made-up case (core test vocabulary), and the ledger of a case whose
 * history carried an acceptance after a proof: refused, refused, accepted, accepted, red, red, refused, green,
 * green, accepted - written by hand, the last five receipts at the case's real hash.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { hashTestCode, hashText } from '../src/lib/tdd/tdd-files.ts'
import { testCodeTokens } from '../src/lib/tdd/test-code-tokens.ts'
import { listTestCalls } from '../src/lib/tdd/test-source.ts'
import {
	FAKE_CASE_HASHES,
	FAKE_FILE_HASHES,
	FAKE_PRODUCTION_HASHES,
	PROOF_KIND_ACCEPT_REASON,
	PROOF_KIND_AT,
	PROOF_KIND_CASE_NAME,
	PROOF_KIND_PRODUCTION_FILE,
	PROOF_KIND_PRODUCTION_TEXT,
	PROOF_KIND_TEST_FILE,
	PROOF_KIND_TEST_TEXT,
} from './proof-kind-fixture.constants.ts'
import { writeFiles } from './scratch-repository.ts'
import { createVitestPackage } from './scratch-vitest-package.ts'

import type { ReceiptKind, TddEntry, TddLedger, TddReceipt } from '../src/lib/tdd/tdd.types.ts'
import type { ProofKindPackage } from './proof-kind-fixture.types.ts'

/**
 * The package with the production committed and the test file written, nothing else, and the hashes the cli
 * records for the case and its file: the file's as `hashTestCode` computes it, the case's as the cli hashes a
 * case - its name and the tokens of its test call - with no vitest run.
 */
export function createProofKindPackage(): ProofKindPackage {
	const root = createVitestPackage({
		files: { [PROOF_KIND_PRODUCTION_FILE]: PROOF_KIND_PRODUCTION_TEXT },
	})
	writeFiles({ root, files: { [PROOF_KIND_TEST_FILE]: PROOF_KIND_TEST_TEXT } })
	const [call] = listTestCalls({ text: PROOF_KIND_TEST_TEXT, file: PROOF_KIND_TEST_FILE })
	const caseHash = hashText(
		`${PROOF_KIND_CASE_NAME}\0${testCodeTokens({ text: call.text, file: PROOF_KIND_TEST_FILE })}`,
	)
	return { root, caseHash, fileHash: hashTestCode({ root, file: PROOF_KIND_TEST_FILE }) }
}

/** The ledger of the package's worktree. */
export function readProofKindLedger(root: string): TddLedger {
	return JSON.parse(readFileSync(ledgerPath(root), 'utf8')) as TddLedger
}

/** Replaces the ledger of the package's worktree with `entries`. */
export function writeProofKindLedger(params: { root: string; entries: TddEntry[] }): void {
	writeFileSync(ledgerPath(params.root), JSON.stringify({ version: 3, entries: params.entries }))
}

/** Replaces the lot file of the package: its `accept` and `revised` entries. */
export function writeProofKindLot(params: {
	root: string
	accept?: Array<{ case: string; reason: string }>
	revised?: Array<{ case: string; reason: string }>
}): void {
	writeFiles({
		root: params.root,
		files: {
			'.dialecte/lot.json': JSON.stringify({
				...(params.accept && { accept: params.accept }),
				...(params.revised && { revised: params.revised }),
			}),
		},
	})
}

/** One hand-written receipt of the fixture's case: the hashes of the case, of its file and of production. */
function receipt(params: {
	kind: ReceiptKind
	caseHash: string
	fileHash: string
	productionHash: string
}): TddReceipt {
	const { kind } = params
	return {
		kind,
		file: PROOF_KIND_TEST_FILE,
		name: PROOF_KIND_CASE_NAME,
		project: '',
		testFileHash: params.fileHash,
		caseHash: params.caseHash,
		productionHash: params.productionHash,
		...(kind === 'accepted' && { reason: PROOF_KIND_ACCEPT_REASON }),
		...(kind === 'refused' && { reason: 'it ran green: this test proves nothing yet' }),
		...(kind === 'red' && { message: 'expected undefined to be x' }),
		at: PROOF_KIND_AT,
	}
}

/** A red run's freeze of the fixture's test file at `hash`. */
function freeze(hash: string): TddEntry {
	return { kind: 'freeze', files: { [PROOF_KIND_TEST_FILE]: hash }, at: PROOF_KIND_AT }
}

/**
 * The reported history, synthetic: the first receipts at other case hashes (the case was reworded), then at
 * the real hash a red, a refusal, two greens at an older hash of the file and a last accepted receipt at the
 * file's hash now, frozen after it. Every production hash is a fake one: production has moved since.
 */
export function reportedLedgerEntries(params: { caseHash: string; fileHash: string }): TddEntry[] {
	const { caseHash, fileHash } = params
	const [first, second, third, fourth] = FAKE_CASE_HASHES
	const [fileOne, fileTwo, fileThree, fileFour] = FAKE_FILE_HASHES
	const [productionOne, productionTwo, productionThree] = FAKE_PRODUCTION_HASHES
	return [
		receipt({ kind: 'refused', caseHash: first, fileHash: fileOne, productionHash: productionOne }),
		receipt({
			kind: 'refused',
			caseHash: second,
			fileHash: fileOne,
			productionHash: productionOne,
		}),
		receipt({
			kind: 'accepted',
			caseHash: second,
			fileHash: fileOne,
			productionHash: productionOne,
		}),
		freeze(fileOne),
		receipt({
			kind: 'accepted',
			caseHash: third,
			fileHash: fileTwo,
			productionHash: productionOne,
		}),
		freeze(fileTwo),
		receipt({ kind: 'red', caseHash: fourth, fileHash: fileThree, productionHash: productionOne }),
		freeze(fileThree),
		receipt({ kind: 'red', caseHash, fileHash: fileFour, productionHash: productionOne }),
		freeze(fileFour),
		receipt({ kind: 'refused', caseHash, fileHash: fileFour, productionHash: productionTwo }),
		receipt({ kind: 'green', caseHash, fileHash: fileFour, productionHash: productionTwo }),
		receipt({ kind: 'green', caseHash, fileHash: fileFour, productionHash: productionTwo }),
		receipt({ kind: 'accepted', caseHash, fileHash, productionHash: productionThree }),
		freeze(fileHash),
	]
}

/** A proof and a stale acceptance only: red, green, then the file edited and an accepted receipt at its new hash. */
export function staleAcceptanceLedgerEntries(params: {
	caseHash: string
	fileHash: string
}): TddEntry[] {
	const { caseHash, fileHash } = params
	const [productionOne, productionTwo, productionThree] = FAKE_PRODUCTION_HASHES
	const fileOld = FAKE_FILE_HASHES[0]
	return [
		receipt({ kind: 'red', caseHash, fileHash: fileOld, productionHash: productionOne }),
		freeze(fileOld),
		receipt({ kind: 'green', caseHash, fileHash: fileOld, productionHash: productionTwo }),
		receipt({ kind: 'accepted', caseHash, fileHash, productionHash: productionThree }),
		freeze(fileHash),
	]
}

/** A case proven red then green and frozen as it is now, no acceptance, no revision; production has moved since. */
export function provenLedgerEntries(params: { caseHash: string; fileHash: string }): TddEntry[] {
	const { caseHash, fileHash } = params
	const [productionOne, productionTwo] = FAKE_PRODUCTION_HASHES
	return [
		receipt({ kind: 'red', caseHash, fileHash, productionHash: productionOne }),
		freeze(fileHash),
		receipt({ kind: 'green', caseHash, fileHash, productionHash: productionTwo }),
	]
}

function ledgerPath(root: string): string {
	return join(root, '.git', 'dialecte-tdd.json')
}
