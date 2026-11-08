# Run instructions: baseline LLM review

## Before you start
1. Choose one model or agent. Use the same model and the same settings for all 54 runs.
2. Record in the scoring sheet's notes: model name, version, provider or local runtime, temperature, and any system prompt or memory setting. Default settings are fine if you record them.
3. Turn off memory and custom instructions, or use a tool that doesn't carry context between chats.
4. Each run must be a fresh chat or a fresh session. Never continue a previous run.

## The prompt (use exactly this, for every run)

Paste this block, then the brand guide from 01_brand_guide.md, then the content piece.

---
You are reviewing marketing copy for brand compliance.
Use only the brand guide provided. Check the content against every rule.
Return JSON only, with no text before or after it, using this schema:
{"verdict": "FLAG" or "PASS", "findings": [{"rule_id": "...", "quote": "...", "explanation": "..."}]}
If no rule is breached, return "verdict": "PASS" and an empty findings list.
Do not invent rule IDs. Use only the IDs in the guide.

BRAND GUIDE:
[paste all of 01_brand_guide.md here, unchanged]

CONTENT TO REVIEW:
[paste one piece_text from 02_test_set.csv here, exactly as written, including the square brackets]
---

Do not change the wording of the prompt between runs. Do not tell the model that this is a test or give it the answer key.

## Procedure
For each piece P01 to P18, and for each run 1, 2 and 3:
1. Open a fresh chat or session.
2. Paste the prompt, guide and piece as above.
3. Save the complete raw output to raw/P01_run1.txt (use the piece ID and run number). Do not edit it.
4. Parse the JSON and fill one row in 04_scoring_sheet.csv:
   - verdict: FLAG or PASS. If the output is not valid JSON, enter PARSE_FAIL and keep the raw file.
   - flagged_rules: the rule_ids in findings, separated by semicolons. Enter NONE if there are no findings.
   - uncited_findings: the number of findings whose rule_id is empty, missing or "none".
   - invented_rules: the number of findings whose rule_id is not in the guide's rule ID list.
   - notes: anything unusual, such as extra text outside the JSON.

Expected total: 54 raw files and 54 scoring rows.

## What the metrics mean
- Verdict change: a piece whose verdict (FLAG or PASS) differs across runs 1, 2 and 3.
- Findings with no rule cited: uncited_findings summed across runs.
- Findings citing a rule not in the guide: invented_rules summed across runs.
- Planted violations missed: required rules not flagged in a given run. The script reports the per-run count and the count missed in all three runs.
- False positives: a FLAG on a clean control (expected_flag = N).

## Honest reporting
- Report the model and settings in §3.4C.
- Report all three runs, including the ones that disagree.
- If a piece failed to run, say so. Do not drop it.
- The baseline is the comparison point for H3. It is not a test of BrandSentinel.
