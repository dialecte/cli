/** The words of a pytest summary line, each with the test count it adds to (`null`: read, counted nowhere). */
export type PytestSummaryWords = Readonly<Record<string, 'passed' | 'failed' | 'skipped' | null>>
