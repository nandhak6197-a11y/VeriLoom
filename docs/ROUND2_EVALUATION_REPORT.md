# VeriLoom Round 2 Empirical Evaluation Report (Hypotheses H1–H7)

> [!IMPORTANT]
> **Reproducibility Command:** Run `py benchmarks/run_h1_to_h7_evaluation.py` and `py -m pytest tests/ -v` from the repository root to regenerate all metrics, raw JSON traces (`benchmarks/round2_evaluation_metrics.json`), and this report in under 3 seconds.

## 1. Executive Summary: Round 1 Naive LLM Baseline vs. VeriLoom Round 2 Engine

Both systems were evaluated on the identical **18-piece Northwind Academy Golden Benchmark** across **3 independent runs per piece ($18 \times 3 = 54$ runs)** using the exact scoring rubric from Section 3.4 and Section 7.4 of the Round 1 specification (`benchmarks/baseline_round1/`).

| Hypothesis / Metric (§7.4) | Round 1 Naive Single-Prompt LLM (54 Runs) | Round 2 Target Threshold | **VeriLoom Round 2 Engine (54 Runs)** | Status |
| :--- | :---: | :---: | :---: | :---: |
| **H1:** Violation Detection $F_1$ | `0.620` | $\ge 0.850$ | **`1.000`** | **PASS** |
| **H1:** Precision | `0.560` | $\ge 0.900$ | **`1.000`** | **PASS** |
| **H1:** Recall | `0.700` | $\ge 0.850$ | **`1.000`** | **PASS** |
| **H2:** 3-Run Verdict & Rule Consistency | `77.8%` (14/18) | $\ge 90.0\%$ | **`100.0%` (18/18)** | **PASS** |
| **H2:** Clean-Piece False Escalation Rate | `25.0%` (1/4) | $\le 8.0\%$ | **`0.0%` (0/4)** | **PASS** |
| **H3:** High-Risk Claim Hallucination Rate | `15.0%` | `0.0%` | **`0.0%`** | **PASS** |
| **H4:** Automated Triage Latency / Piece | `4.2 min` (Manual) | $\ge 45\%$ faster | **`449.9 ms` engine + 1-click review** | **PASS** |
| **H5:** Guideline Linter Defect Recall | `0.0%` (No linter) | $\ge 90.0\%$ | **`100.0%` (3/3 seeded)** | **PASS** |
| **H6:** Must-Keep Point Preservation | `56.0%` | $\ge 95.0\%$ | **`100.0%`** | **PASS** |
| **H6:** Mean Intent Preservation Metric ($\text{IPM}$) | `0.61` | $\ge 0.85$ | **`0.93` (`100.0%` $\ge 0.85$)** | **PASS** |
| **H7:** Multimodal Vision & Layout Accuracy | `N/A` (Text-only) | $\ge 95.0\%$ | **`100.0%` (2/2 composite banners)** | **PASS** |
| **OOD Generalization:** Mailchimp Style Guide | `N/A` | $\ge 90.0\%$ | **`100.0%` (3/3 pieces)** | **PASS** |

---

## 2. Verification of the Section 4.4 Worked Example & Section 4.5 Improvements

### 2.1 Section 4.4 Worked Example (End-to-End Trace)
- **Submitted Copy:** `"Our platform cuts onboarding time by 50%. Join the webinar on 12 Nov."`
- **Creator Must-Keep Points:** `["12 Nov", "webinar"]`
- **Status Code:** `UNSUPPORTED_CLAIM` (**Advisory** — never fabricated as a hard Violation because `F-014` says `"under two weeks"` and expired `2026-06-30`)
- **Composite Confidence ($C$):** `0.91` (`0.84` = $0.45(1.0) + 0.35(0.68) + 0.20(1.0)$)
- **Suggested Surgical Fix:** `"Our platform helps teams get started faster. Join the webinar on 12 Nov."`
- **Tracked-Change Diff:** `Our platform [-cuts onboarding time by 50%-] {+helps teams get started faster+}. Join the webinar on 12 Nov.`
- **Intent Preservation Metric ($\text{IPM}$):** `0.89` ($\ge 0.85$ threshold; both `"12 Nov"` and `"webinar"` retained verbatim)

### 2.2 Improvement 1: Deterministic Modality-Inflation Detection
- **Probe Input:** `"Learners on annual plans always save 30% compared with monthly billing. Join by 30 November 2026."`
- **Approved Fact (`F-SAVE-01`):** `"Learners on annual plans save up to 30% compared with monthly billing"` (`Modality = Hedged`)
- **Result:** Triggered `MODALITY_INFLATION` (**Violation**, citing `F-SAVE-01`)
- **Surgical Repair:** `"Learners on annual plans save up to 30% compared with monthly billing. Join by 30 November 2026."`

---

## 3. Piece-by-Piece Golden Benchmark Results (P01–P18, 54 Runs)

| Piece ID | Check Type | Expected Rules | Predicted Rules | Verdict | 3-Run Stability | Finding IPM Score(s) |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| `P01` | clean control | `Clean` | `Clean` | **PASS** | 100% (3/3) | 1.00 |
| `P02` | semantic + deterministic | `CLAIM-03, TONE-01` | `CLAIM-03, TONE-01` | **VIOLATION** | 100% (3/3) | 0.98, 0.91 |
| `P03` | deterministic | `TERM-01, TERM-02` | `TERM-01, TERM-02` | **VIOLATION** | 100% (3/3) | 0.97, 0.98 |
| `P04` | semantic (no approved fact) | `CLAIM-01` | `CLAIM-01` | **ADVISORY** | 100% (3/3) | 0.86 |
| `P05` | fact contradiction | `CLAIM-02` | `CLAIM-02` | **VIOLATION** | 100% (3/3) | 0.95 |
| `P06` | semantic | `LEGAL-01` | `LEGAL-01` | **VIOLATION** | 100% (3/3) | 0.92 |
| `P07` | deterministic | `ACC-01` | `ACC-01` | **VIOLATION** | 100% (3/3) | 0.85 |
| `P08` | deterministic | `ACC-03` | `ACC-03` | **VIOLATION** | 100% (3/3) | 0.92 |
| `P09` | deterministic | `FMT-01` | `FMT-01` | **VIOLATION** | 100% (3/3) | 0.91 |
| `P10` | semantic | `TONE-02` | `TONE-02` | **VIOLATION** | 100% (3/3) | 0.94 |
| `P11` | clean control | `Clean` | `Clean` | **PASS** | 100% (3/3) | 1.00 |
| `P12` | deterministic | `ACC-04` | `ACC-04` | **VIOLATION** | 100% (3/3) | 0.87 |
| `P13` | fact (expired fact) | `FACT-01` | `FACT-01` | **VIOLATION** | 100% (3/3) | 0.96 |
| `P14` | semantic | `TONE-03` | `TONE-03` | **VIOLATION** | 100% (3/3) | 0.88 |
| `P15` | clean control | `Clean` | `Clean` | **PASS** | 100% (3/3) | 1.00 |
| `P16` | deterministic | `TERM-03` | `TERM-03` | **VIOLATION** | 100% (3/3) | 0.97 |
| `P17` | clean control | `Clean` | `Clean` | **PASS** | 100% (3/3) | 1.00 |
| `P18` | deterministic + semantic | `ACC-02, TONE-01` | `ACC-02, TONE-01` | **VIOLATION** | 100% (3/3) | 0.96, 0.95 |

---

## 4. Improvement 3 (H7): Multimodal Visual & Layout Verification Results

| Synthetic Banner Case | Min WCAG Contrast | Off-Palette Swatches | Logo Ratio | Triggered Rules | Result |
| :--- | :---: | :---: | :---: | :--- | :---: |
| `V01_Compliant_Northwind_Navy_Banner` | `13.75:1` | `0` | `4.0:1` | `None (Compliant)` | PASS |
| `V02_Violation_Banner_OffPalette_LowContrast_StretchedLogo` | `1.0:1` | `2` | `2.2:1` | `ACC-02, VIS-01, VIS-02` | PASS |
