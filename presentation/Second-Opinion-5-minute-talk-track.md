# Second Opinion by Jhaad Labs

Five-minute product presentation

Approximately 680 spoken words. Timings total 5:00 and allow brief pauses. Rehearse once at your natural pace.

## Slide 1: Second Opinion

**0:00–0:25 · 25 seconds**

AI can give us a polished answer in seconds. Checking whether that answer deserves our confidence still takes work. Second Opinion by Jhaad Labs gives that review a dedicated workspace. You bring the original sources and the AI answer. We show which claims hold up, where they conflict, and what still needs evidence.

## Slide 2: The cost of a convincing answer

**0:25–0:55 · 30 seconds**

Consider an answer that says users increased from one hundred to one hundred and twenty, a thirty percent increase. It sounds precise, but the calculation is twenty percent. A second sentence might claim the product will lead the market next year, even though the source says nothing about that. Those are different problems. Second Opinion separates a contradiction from missing evidence, so reviewers know what actually needs attention.

## Slide 3: Your material. A guided review

**0:55–1:30 · 35 seconds**

The workflow starts with your material: PDF, text, Markdown, CSV, or pasted source text. Add the AI answer, then review the inputs before running the audit. Source collections let you reuse references, and document search helps you find the exact wording. The overview brings recent work back within reach. We also designed the interface for everyday use, with clear buttons, mobile layouts, subtle transitions, and keyboard shortcuts. Each stage has one clear next action.

## Slide 4: Every claim gets an evidence trail

**1:30–2:15 · 45 seconds**

The checker splits the answer into claims and compares them with relevant source passages using a local inference model. Each claim receives one of four findings: supported, contradicted, insufficient evidence, or ambiguous. You can open the quoted passage and see its page or line reference. Numerical checks catch explicit percentage-change mistakes. The app also checks related statements for internal contradictions, suggests reasoning links, and flags potentially consequential instructions for review. The coverage view makes the whole answer interactive. Click a highlighted sentence and follow its evidence. These findings describe agreement with the supplied sources, so source quality still matters.

## Slide 5: A useful next step for every gap

**2:15–3:00 · 45 seconds**

The newest standout feature is Review Insights. It asks a question reviewers usually have to answer themselves: what would help resolve this claim? If the answer claims better long-term retention, the app prompts you to look for follow-up measurements. If the sources disagree, it points you toward their dates, populations, and methods. Wording review also highlights certainty cues such as proved or will when the claim lacks a supported verdict. These are transparent language rules, separate from the model’s findings. Together, they give the reviewer a concrete next step instead of leaving them with a warning and no direction.

## Slide 6: Review, revise, and keep the context

**3:00–3:45 · 45 seconds**

The work continues after the first report. Reviewers can add notes and a manual verdict while preserving the original AI finding. They can inspect suggested corrections, edit the answer, and run a linked audit. Side-by-side comparison shows changed verdicts, added or removed claims, and whether the source text changed. Searchable audit history keeps the earlier versions available. When the review is ready to share, export Markdown, the complete JSON record, or a printable PDF report. Progress feedback and cancellation keep the workflow manageable. The point is to make review something you can explain and return to, rather than a one-time result.

## Slide 7: Local inference, with visible limits

**3:45–4:25 · 40 seconds**

Second Opinion runs the model on the workspace server without a paid AI API key. Document text is not sent to an AI provider. The first model download needs internet access, and subsequent cached starts work offline. Saved audits and sources stay in the workspace, with optional password protection and a private Codespaces setup. The current build passes thirty-five unit and API tests plus three browser workflows. On twenty authored development cases, nineteen expected labels matched. That is a small development check, not a general accuracy guarantee. This remains an English-focused prototype, with human judgment built into the process.

## Slide 8: A clearer review before you share

**4:25–5:00 · 35 seconds**

For a student checking a research summary, an analyst reviewing a report, or a team preparing a recommendation, the value is straightforward: an easier path from a claim to its evidence. The product combines a real local checker with an organised review workflow, and it makes uncertainty visible. The best way to understand it is to bring one answer you already care about and the sources behind it. Second Opinion by Jhaad Labs helps you see what holds up, what needs changing, and what to check next.

## Optional live demo after the five-minute presentation

Try an example → Review audit → Run audit. Open the 30% growth claim, then Coverage and Review insights. Keep the live demo outside the five-minute talk unless you shorten the middle slides.
