# Initial validation

November 8, 2026 · Eastern time

Application baseline
[`f14a00c758c8fed76100d1f309e8a2f6814bb34e`](https://github.com/nsram/prime-factor-64/commit/f14a00c758c8fed76100d1f309e8a2f6814bb34e).

Sriram chose the two-stage process. ChatGPT drafted the specification, Muse
independently verified the oracles and reviewed the proposed detectors, and
ChatGPT implemented the approved suite. The review clarified that strategy
predicates are one-way checks and that browser dealer probes should call the
global deck builder. H01 adds the suggested history check.

## Regression results

The 10 unit and 34 browser checks passed on three consecutive local
CI-mode runs with retries disabled. Six opt-in diagnostics ran separately.
The test identifiers cover all 38 rows of the approved matrix.

## Mutation results

`npm run test:mutations` detected all 22 targeted defects. Exact source edits and
detectors are recorded in [cases.mjs](mutations/cases.mjs). Each mutation ran
in a disposable copy using the application baseline above. The selected
test had to fail at its assigned assertion.

| Mutation | Detector | Assertion that failed |
|---|---|---|
| M01 | A01 | Full product-to-factor map differs after raising the cutoff |
| M02 | A01 | The 144 answer set lacks a permitted pair |
| M03 | A04 | Full Easy run contains fewer than 64 distinct products |
| M04 | A04 | Strategy board membership differs despite unchanged deck size |
| M05 | A04 | Full Easy run repeats products when starting past the first board |
| M06 | G07 | Covered count changes after one success |
| M07 | G01 | Review names the second-selected fact as the miss |
| M08 | G05 | A matched row is out of section-local order |
| M09 | G06 | Final recall denominator includes the replayed attempt |
| M10 | L05 | Easy Mode writes shared practice progress |
| M11 | G03 | Classic advances while paused |
| M12 | G08 | A match at exactly 5,000 ms lacks the Slow label |
| M13 | P02 | Two successful answers on the same local day survive the merge |
| M14 | L02 | The drill selects a sixth weak product |
| M15 | L04 | A Slow first try is stored as a miss |
| M16 | P04 | Two blocked writers share a single staged key |
| M17 | P05 | The queued save is missing before navigation |
| M18 | P06 | A key staged after enumeration is deleted by the active drain |
| M19 | P03 | Replaying a batch writes a duplicate run ID |
| M20 | P07 | The original corrupt snapshot is missing from backup |
| M21 | P04 | The main snapshot changes while another tab holds the lock |
| M22 | P08 | A captured batch reappears after Reset |

The first pass improved two detectors. A01 now checks the deck before asking
the dealer to consume it, so M01 fails an arithmetic assertion even when
dealing would also throw. P03 checks the stored run IDs immediately after
replay, before another read could normalize duplicates and hide M19.

## Diagnostic observations

These observations do not decide product policy.

| Case | Observed on the application baseline |
|---|---|
| Q01 | A Classic miss before a save boundary is absent from storage after raw reload or the Project home link. Reproduced in Chromium |
| Q02 | A deliberately interleaved no-lock write overwrites the second writer's data. Reproduced with the VM storage adapter |
| Q03 | A batch staged after Reset enumerates keys survives and can be merged later. A storage-denied tab can also restore its in-memory data after another tab resets. Reproduced with the VM storage adapter |
| Q04 | An otherwise accepted raw snapshot with two correct timestamps on one day makes the weak prompt ineligible. Reproduced in Chromium. The normal store merge and local-midnight cases are tested separately |

The CI workflow targets Node 24 and Playwright's Chromium on GitHub Actions.
Local validation used Node 24 and Chromium 153 via `PF64_CHROMIUM_PATH` because
the standard browser download was unavailable in the implementation
environment. GitHub Actions results require a run on GitHub.
