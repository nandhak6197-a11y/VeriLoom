# Baseline experiment kit: LLM brand review (Round 1, §3.4C)

Purpose: measure how a general-purpose LLM reviews marketing copy against a brand guide, across three runs of the same prompt, so that BrandSentinel's grounded tier can be compared against it in Round 2 (H3).

Brand used: Northwind Academy (fictional). Using a fictional guide avoids licence limits on the Mailchimp guide (CC BY-NC 4.0) and matches the demo tenant in §5.5.

Files
| File | What it is |
|---|---|
| 01_brand_guide.md | The rule set and approved facts. Paste it into the prompt, unchanged. |
| 02_test_set.csv | 18 pieces (14 with planted violations, 4 clean controls) with the answer key. Do not show this file to the model. |
| 03_run_instructions.md | Exact prompt, run procedure, and raw-output filing. |
| 04_scoring_sheet.csv | 54 rows (18 pieces x 3 runs). Fill in one row per run. |
| 05_score.py | Computes the §3.4C metrics from 04 and 02. |
| 06_observation_log_template.md | Template for the public-discussion observation log (§3.4B). |

Order of work: read 03 first, then run all 54 calls, then fill 04, then run 05.

Honesty rules
- Record raw outputs exactly as produced. Do not edit them.
- Results come from real runs only. Do not fill any cell from memory or by estimate.
- Report which model and settings were used. A local model is a valid baseline, but say so in the PDF.
