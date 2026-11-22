### Changed

- **Breaking:** `dialecte changelog check` and `changelog release` refuse raw HTML in a fragment or the Unreleased part other than whole comments and bare tags with no attribute of `<b>`, `<i>`, `<u>`, `<s>`, `<em>`, `<strong>`, `<small>`, `<mark>`, `<del>`, `<ins>`, `<sub>`, `<sup>`, `<code>`, `<kbd>`, `<samp>`, `<var>`, `<details>`, `<summary>`, `<br>` and `<wbr>`, each closed inside the block or item a release moves (an item of a `- ` list, any other top-level block). An `<img src>`, an `<a href>`, a `<div>`, a `<script>` or a placeholder such as `<version>` written outside a code span is refused, the problem naming the piece and pointing to backticks; markdown links and images say the same.

### Fixed

- `dialecte changelog release` no longer lifts a line hidden by raw HTML into view: an element opened in one item and closed in a later one counted as closed, and the breaking items moved first out of it. Every block or item now closes its own HTML.
- A tag inside an HTML comment is text: `<!-- <script> -->` between two items is no longer refused.
- The released-changelog rule (and `changelog check`) compares a released section without its link reference definitions, which render nothing: adding a link line before text that follows the link block no longer reads as a change to the last released section, and a changed line is still reported at its own line.
