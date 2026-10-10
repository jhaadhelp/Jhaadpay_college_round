# CRCE submission guide

**Second Opinion by Jhaad Labs**
## Problem

AI answers can contain incorrect quantities, contradictions, unsupported predictions, and conclusions that do not follow from the source. A second model's unsupported opinion is not adequate evidence.

## Our approach

Second Opinion creates an inspectable claim/evidence workspace. Every finding is linked to retrieved source text or an explicit numerical calculation. Missing evidence is distinct from contradiction. Reviewers can correct the answer, preserve their own judgment, and compare the resulting audit with the original.

The distinctive product contribution is the connected workflow: **source → claim → evidence → possible downstream conclusion → human review → revised answer → compared findings**. The individual techniques are established methods; this project does not claim to invent natural-language inference, fact-checking, or BM25.

## Requirement coverage

| Problem-statement requirement | Demonstration |
|---|---|
| Claim-level verification | Sentence/clause cards with exact answer offsets and four possible verdicts. |
| Evidence-grounded auditing | Verbatim passage, document name, PDF page/text line, and inference signal for each retrieved piece of evidence. |
| Precise error localization | Select a claim card; the matching span, finding, and source context are shown together. Compound claims may need splitting. |
| Reasoning consistency | Related-pair contradiction checks and a map of explicit conclusion-marker dependencies. |
| Uncertainty and ambiguity | Missing evidence remains insufficient; conflicting sources and borderline scores produce ambiguity. |
| Confidence-aware reporting | Model signals are explicitly uncalibrated. No invented accuracy or truth-confidence percentage is displayed. |
| Interactive dashboard | Filtered verdict counts, evidence review, sources, comparison, human notes, history, and exports. |

## Suggested presentation sequence

1. Start with the Northstar pilot sample and its original source.
2. Run a real audit and inspect the 30% vs 20% discrepancy.
3. Contrast a clear contradiction with the unsupported market-leader prediction.
4. Show a conclusion linked to a questionable premise, with the heuristic limitation visible.
5. Record a human note while preserving the machine verdict.
6. Correct the numerical error, rerun, and show the side-by-side change.
7. Print the report or download the evidence JSON.

## Honest evaluation narrative

The initial authored 20-case development set yielded 19 matching labels. The miss is disclosed in `evaluation/results.json`. The set is small, English-only, and not independent of development. It does not establish production accuracy or calibration. Present the working features, explain the bounded methods, and identify future research work without implying those extensions are already implemented.

## Remaining research limitations

Cross-document reasoning, reliable causal inference, OCR, complex table reasoning, multilingual verification, confidence calibration, and independent source credibility assessment remain outside this prototype's claimed capabilities. The public demo should use supplied research/product material, not consequential expert decisions.
