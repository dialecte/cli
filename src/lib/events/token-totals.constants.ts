import type { TokenField } from './token-totals.types.ts'

/** The four parts of a station's tokens: their sum is its total when all four are known and no total is reported. */
export const TOKEN_PARTS: readonly TokenField[] = ['input', 'output', 'cacheRead', 'cacheWrite']

/** Every token field, the parts then the vendor's total, as the lot's fields list them. */
export const TOKEN_FIELDS: readonly TokenField[] = [...TOKEN_PARTS, 'total']

/** The most decimal places a money sum keeps; an amount with more is rounded half-up to these. */
export const MONEY_DECIMAL_LIMIT = 6

/** The base of the decimal places of an amount. */
export const DECIMAL_BASE = 10

/** The digit from which a dropped decimal rounds the kept ones up (half-up). */
export const HALF_UP_DIGIT = 5

/** An amount written with an exponent (`5e-7`): the mantissa's digits and the exponent. */
export const EXPONENT_PATTERN = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/
