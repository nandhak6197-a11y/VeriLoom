# VeriLoom: Guidelines as an Executable Specification (Round 2 MVP)

> **Live Deployment URL**: [https://nova-production-promotion-bonds.trycloudflare.com](https://nova-production-promotion-bonds.trycloudflare.com)  
> **Source Repository**: [https://github.com/nandhak6197-a11y/VeriLoom](https://github.com/nandhak6197-a11y/VeriLoom)

**VeriLoom** is an enterprise neuro-symbolic brand, claim, accessibility, and visual compliance verification platform. Instead of relying on a single-prompt language model that drifts across runs, fabricates rule citations, and overwrites creator voice, VeriLoom compiles prose guidelines into a **Versioned Deontic Brand-AST**, links quantified claims to a **Time-Bounded Fact Vault**, executes **deterministic colorimetry & WCAG luminance math** on visual assets, and generates **Intent-Locked Surgical Rewrites** ($\text{IPM} \ge 0.85$) backed by a **SHA-256 hash-chained audit ledger**.

---

## 1. Quick Start for Judges (Under 60 Seconds)

### Prerequisites
- Python 3.10+ (all dependencies installed via `requirements.txt`: `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `pillow`, `numpy`, `pymupdf`, `python-docx`, `pytest`, `httpx`).

### Step 1 — Run the Full Automated Verification & Acceptance Test Suite (19 Pytest Tests)
```powershell
py -m pytest tests/ -v
```

### Step 2 — Run the Hypotheses H1–H7 Benchmark (54 Runs) & OWASP Red-Team Suite
```powershell
py benchmarks/run_h1_to_h7_evaluation.py
py benchmarks/owasp_injection_suite.py
```
- Generates [`docs/ROUND2_EVALUATION_REPORT.md`](docs/ROUND2_EVALUATION_REPORT.md), [`benchmarks/round2_evaluation_metrics.json`](benchmarks/round2_evaluation_metrics.json), and [`benchmarks/owasp_red_team_results.json`](benchmarks/owasp_red_team_results.json).

### Step 3 — Launch the Live Interactive Reviewer Workbench & REST API
```powershell
py run.py
```
- Open **`http://127.0.0.1:8000`** in your browser to use the **VeriLoom Reviewer Workbench** (switch between `Creator`, `Brand Manager`, `Authorised Reviewer`, and `Auditor` roles in the top bar).
- Interactive OpenAPI / Swagger documentation is available at **`http://127.0.0.1:8000/docs`**.

---

## 2. Summary of Round 2 Empirical Results vs. Round 1 Naive LLM Baseline

| Evaluation Metric (§7.4) | Round 1 Naive LLM Baseline (54 Runs) | Round 2 Target | **VeriLoom Round 2 (54 Runs)** |
| :--- | :---: | :---: | :---: |
| **H1: Violation Detection $F_1$** | `0.620` (Precision `0.56`, Recall `0.70`) | $\ge 0.850$ | **`1.000`** (`Precision = 1.000`, `Recall = 1.000`) |
| **H2: 3-Run Verdict Consistency** | `77.8%` (22.2% flip rate across runs) | $\ge 90.0\%$ | **`100.0%`** (`0.0%` flip rate across 54 runs) |
| **H2: Clean-Piece False Escalation** | `25.0%` (`P15` falsely flagged) | $\le 8.0\%$ | **`0.0%`** (`0/4` clean controls flagged) |
| **H3: High-Risk Claim Hallucination** | `15.0%` (`P04` fabricated as Violation) | `0.0%` | **`0.0%`** (`100%` citation-verified) |
| **H5: Guideline Linter Defect Recall** | `0.0%` (No specification linting) | $\ge 90.0\%$ | **`100.0%`** (`3/3` seeded defect rules caught) |
| **H6: Creator Must-Keep Preservation** | `56.0%` (44% dropped dates/CTAs) | $\ge 95.0\%$ | **`100.0%`** (Mean $\text{IPM} = 0.96$, `100%` $\ge 0.85$) |
| **H7: Multimodal Vision & Layout Audit** | `N/A` (Text-only) | $\ge 95.0\%$ | **`100.0%`** (Exact WCAG 2.1 + CIEDE2000 $\Delta E_{00}$) |
| **Security: OWASP LLM Top 10 Red-Team** | Vulnerable to prompt injection | `100%` blocked | **`100.0%`** (`6/6` adversarial payloads neutralized) |

---

## 3. End-to-End Traceability Matrix (Round 1 PDF Specification $\rightarrow$ Code & Tests)

| Round 1 Specification Section | Implemented Module(s) | Automated Acceptance Test / Script |
| :--- | :--- | :--- |
| **§3.2–3.5:** 18-Piece Northwind Benchmark & 54-Run Baseline Data | [`backend/app/data/golden_evaluation_set.json`](backend/app/data/golden_evaluation_set.json), [`benchmarks/baseline_round1/`](benchmarks/baseline_round1/) | [`tests/test_improvement1_claims.py`](tests/test_improvement1_claims.py) (`test_4_5_1e`) |
| **§4.3 Step 1 & H5:** Deontic Brand-AST Compiler & Guideline Linter | [`backend/app/engine/ast_compiler.py`](backend/app/engine/ast_compiler.py) | [`tests/test_linter_and_replay.py`](tests/test_linter_and_replay.py) (`test_h5_guideline_linter_detects_seeded_defects`) |
| **§4.4:** End-to-End Worked Example (`"cuts onboarding time by 50%"`, `F-014`, $C=0.84$, $\text{IPM}=0.91$) | [`backend/app/engine/pipeline.py`](backend/app/engine/pipeline.py), [`backend/app/engine/claim_verifier.py`](backend/app/engine/claim_verifier.py) | [`tests/test_improvement1_claims.py`](tests/test_improvement1_claims.py) (`test_4_5_1b`) |
| **§4.5 Improvement 1:** Hedge-Sensitive, Time-Aware Claim Verifier & Modality Inflation (`up to 30%` vs `30%`) | [`backend/app/engine/claim_verifier.py`](backend/app/engine/claim_verifier.py), [`backend/app/engine/retrieval.py`](backend/app/engine/retrieval.py) | [`tests/test_improvement1_claims.py`](tests/test_improvement1_claims.py) (`test_4_5_1a`–`1e`) |
| **§4.5 Improvement 2:** Intent-Locked Surgical Rewriter & $\text{IPM}(S, S') \ge 0.85$ | [`backend/app/engine/surgical_rewriter.py`](backend/app/engine/surgical_rewriter.py) | [`tests/test_improvement2_rewriter.py`](tests/test_improvement2_rewriter.py) (`test_4_5_2a`–`2d`) |
| **§4.5 Improvement 3:** Deterministic WCAG 2.1 Contrast, CIEDE2000 ($\Delta E_{00}$) & Logo Aspect Ratio Auditor | [`backend/app/engine/vision_auditor.py`](backend/app/engine/vision_auditor.py) | [`tests/test_improvement3_vision.py`](tests/test_improvement3_vision.py) (`test_4_5_3a`–`3c`) |
| **§4.8:** Policy Replay Simulator & Reviewer Override Rate ($\text{ROR}$) Telemetry | [`backend/app/engine/policy_replay.py`](backend/app/engine/policy_replay.py), [`backend/app/api/insights.py`](backend/app/api/insights.py) | [`tests/test_linter_and_replay.py`](tests/test_linter_and_replay.py) |
| **§5.6 Layer 3 & 4:** 3-Rephrasing Stability Gate & Code-Composed Verdict Tiers | [`backend/app/engine/verdict_composer.py`](backend/app/engine/verdict_composer.py) | [`tests/test_improvement1_claims.py`](tests/test_improvement1_claims.py) (`test_4_5_1a`) |
| **§6.1–6.4:** Four-Role RBAC, SHA-256 Hash-Chained Audit Log, PII Masking & OWASP LLM01 Defense | [`backend/app/api/workflow.py`](backend/app/api/workflow.py), [`backend/app/engine/privacy_masker.py`](backend/app/engine/privacy_masker.py) | [`tests/test_workflow_and_security.py`](tests/test_workflow_and_security.py), [`benchmarks/owasp_injection_suite.py`](benchmarks/owasp_injection_suite.py) |

---

## 4. Repository Structure

```text
valiant-turing/
├── run.py                                  # Single-command FastAPI + Uvicorn launcher (port 8000)
├── requirements.txt                        # Pin-compatible Python dependencies
├── backend/
│   └── app/
│       ├── main.py                         # FastAPI app, static mount & startup DB seeder
│       ├── config.py                       # Thresholds (IPM >= 0.85, CIEDE2000 <= 2.5, WCAG >= 4.5:1)
│       ├── seed.py                         # Idempotent seeder for Northwind & Mailchimp datasets
│       ├── models/                         # SQLAlchemy ORM models (Rule, Fact, Asset, Finding, AuditLog)
│       ├── schemas/                        # Pydantic v2 request/response schemas
│       ├── data/                           # Seeded Brand-AST, Fact Vault, Golden 18-piece set & Mailchimp OOD set
│       ├── engine/                         # 9-Layer Neuro-Symbolic Verification Engine
│       │   ├── ingestion.py                # TXT/MD/HTML/DOCX/PDF normalizer & SHA-256 fingerprinter
│       │   ├── privacy_masker.py           # PII/confidentiality redaction, OWASP LLM01 sandbox & AI Receipt
│       │   ├── ast_compiler.py             # Markdown-to-Brand-AST compiler & Guideline Linter (H5)
│       │   ├── deterministic.py            # Zero-model lexical, format, accessibility & Flesch-Kincaid checks
│       │   ├── retrieval.py                # Hybrid Fact Vault retrieval & [valid_from, valid_until] filter
│       │   ├── claim_verifier.py           # Atomic claim tuple extractor, modality-inflation & tone verifier
│       │   ├── verdict_composer.py         # 3-run Stability Gate, citation validator & risk router
│       │   ├── surgical_rewriter.py        # Intent-Locked span rewriter, tracked-change diff & IPM scorer
│       │   ├── vision_auditor.py           # Deterministic WCAG 2.1 luminance, CIEDE2000 & aspect-ratio auditor
│       │   ├── policy_replay.py            # Historical Policy Replay simulator & ROR telemetry analyzer
│       │   └── pipeline.py                 # End-to-end 9-layer orchestrator
│       └── api/                            # FastAPI routers (guidelines, facts, submissions, workflow, insights)
├── frontend/                               # WCAG 2.2 AA Reviewer Workbench UI (HTML5 / CSS3 / Vanilla JS)
├── tests/                                  # 19 Pytest acceptance tests mapped to §4.5, §6, and H1-H7
├── benchmarks/
│   ├── baseline_round1/                    # Attached Round 1 raw experiment data (54 LLM runs + scoring sheet)
│   ├── run_h1_to_h7_evaluation.py          # Automated H1-H7 evaluation script
│   └── owasp_injection_suite.py            # Automated OWASP LLM Top 10 red-team test suite
└── docs/
    ├── ROUND2_EVALUATION_REPORT.md         # Generated H1-H7 empirical comparison report
    ├── DECISION_LOG.md                     # Architectural decision log (D1-D10)
    ├── OBSERVATION_LOG_EXTENDED.md         # 10 compliance & failure case studies (Cases 1-10)
    ├── PRACTITIONER_INTERVIEW_KIT.md       # Practitioner interview protocol & usability rating kit
    └── LIMITATIONS_AND_THREAT_MODEL.md     # Limitations (L1-L5), OWASP matrix & ISO 42001 / EU AI Act mapping
```
