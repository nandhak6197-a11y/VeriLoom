# Practitioner Interview & Usability Evaluation Kit (§3.7 & Hypothesis H4)

> [!NOTE]
> **Truthfulness & Status Disclosure (per Round 1 §3.7):**
> In accordance with our commitment to zero fabricated user studies, this document contains the complete, ready-to-run **Practitioner Interview Protocol, Role-Based Task Scripts, and NASA-TLX / SUS Scoring Sheet** designed for evaluating the VeriLoom Round 2 Reviewer Workbench with 3–5 marketing, brand, and compliance practitioners. All automated system-side H4 metrics (sub-2ms engine triage latency, 100% rule/clause citation coverage, and 1-click surgical diff application) are verified in `docs/ROUND2_EVALUATION_REPORT.md`.

---

## 1. Participant Target Profile (3–5 Practitioners)

| Participant Slot | Target Role | Experience Criteria | Mapped VeriLoom RBAC Persona |
| :--- | :--- | :--- | :--- |
| **P1** | Brand / Marketing Operations Manager | 3+ years managing brand voice & style guides | `Brand Manager` |
| **P2** | Senior Copywriter / Content Creator | 2+ years drafting multi-channel campaigns (social, email, web) | `Creator` |
| **P3** | Legal / Regulatory Compliance Reviewer | Experience reviewing educational, financial, or health/advertising claims | `Authorised Reviewer` |
| **P4** | Agency Account / Creative Lead | Submits external campaign drafts & banners against client guidelines | `Creator` (`origin = agency`) |
| **P5** | Design Systems / Accessibility Lead | Audits WCAG 2.1 AA contrast, alt text, and visual identity | `Brand Manager` / `Auditor` |

---

## 2. 25-Minute Structured Session Protocol

### Part A: Context & Baseline Friction Discovery (5 minutes)
1. *"Walk us through how your team currently checks a campaign draft (text + banner image) against your brand style guide and approved product facts before launch."*
2. *"When a draft is rejected by Brand or Legal, how is feedback communicated back to the creator, and how many revision rounds does a typical campaign take?"*
3. *"Have you ever had an expired statistic, price, or unhedged claim ('save 30%' instead of 'save up to 30%') slip into published copy? How was it caught?"*

### Part B: Hands-On Role Tasks in the VeriLoom Workbench (15 minutes)

#### Task 1 — Creator Role (`Creator` Persona, 4 mins)
- Open the **Submit & Verify** tab in the VeriLoom Workbench (`http://127.0.0.1:8000`).
- Load the **§4.4 Worked Example** (*"Our platform cuts onboarding time by 50%. Join the webinar on 12 Nov."*) with must-keep points `["12 Nov", "webinar"]`.
- Inspect the generated **Tracked-Change Diff** (`[-cuts onboarding time by 50%-] {+helps teams get started faster+}`) and the **Intent Preservation Metric ($\text{IPM} = 0.91$)**.
- **Observation Prompt:** Does the surgical diff preserve your intended webinar announcement while resolving the unsubstantiated 50% claim?

#### Task 2 — Authorised Reviewer Role (`Authorised Reviewer` Persona, 4 mins)
- Switch role to `Authorised Reviewer` in the top navigation bar.
- Review the high-risk **Modality Inflation** finding (`MI-01`: *"always save 30%"* vs. `F-SAVE-01` *"save up to 30%"*) and the **Stale Fact** finding (`P13`: *"12 weeks"* vs. expired `F-DUR-01` and active `F-DUR-02` *"10 weeks"*).
- Execute a 1-click **Accept Suggestion** on `MI-01` and test a **Reviewer Override** with a mandatory structured reason (`Rule Unclear` vs. `Creator Training Needed`).

#### Task 3 — Multimodal Banner Audit (`Brand Manager` Persona, 3 mins)
- Open the **Submit & Verify** tab -> **Multimodal Image & Banner Auditor**.
- Click **Test Violation Banner** (`#FF4500` neon orange header + `1.72:1` low-contrast grey text + `2.2:1` stretched logo) and then **Test Compliant Banner**.
- Inspect the measured **CIEDE2000 ($\Delta E_{00}$)** swatch table and **WCAG 2.1 OCR bounding-box contrast ratios**.

#### Task 4 — Guideline Linter & Policy Replay (`Brand Manager` / `Auditor` Persona, 4 mins)
- Open **Guideline Lab** and run the **Brand-AST Linter** to inspect the 4 detected specification defects (`CONTRADICTORY_RULES`, `UNCHECKABLE_VAGUE_CLAUSE`, `OVERLAPPING_SCOPE`, `MISSING_EXAMPLES`).
- Run **Policy Replay** on a proposed rule change and inspect the **Governance & Audit Ledger** tab (`Verify SHA-256 Hash Chain`).

---

## 3. Post-Task Quantitative Rating Sheet (5 minutes)

Participants rate each item on a 1–5 Likert scale (`1 = Strongly Disagree`, `5 = Strongly Agree`):

| # | Evaluation Dimension | Mapped Hypothesis | Rating (1–5) | Notes |
| :---: | :--- | :---: | :---: | :--- |
| **Q1** | The rule citations (`rule_id`, `source_clause`) and Fact Vault validity dates made it faster to verify claims than searching a PDF style guide. | **H4** | `[   ]` | |
| **Q2** | Separating `Advisory` (unverified claim with no contradicting fact) from `Violation` (direct contradiction or modality inflation) reduced false alarms. | **H2 / H3** | `[   ]` | |
| **Q3** | The surgical tracked-change suggestions fixed the policy issue without erasing my must-keep campaign details (dates, CTAs, offers). | **H6** | `[   ]` | |
| **Q4** | The deterministic WCAG contrast and CIEDE2000 colour swatch numbers were clearer than subjective visual feedback. | **H7** | `[   ]` | |
| **Q5** | The Guideline Linter and Policy Replay preview would make me more confident when updating brand rules. | **H5** | `[   ]` | |
