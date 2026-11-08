# -*- coding: utf-8 -*-
"""Acceptance Tests for Improvement 1: Hedge-Sensitive, Time-Aware Claim Verifier (§4.5.1 & H1, H3, H4)."""
from backend.app.seed import load_json_data
from backend.app.engine.pipeline import run_full_verification_pipeline
from backend.app.engine.verdict_composer import compose_verdict_and_route


def _get_northwind_rules_and_facts():
    guide = load_json_data("northwind_guide.json")
    facts = load_json_data("northwind_facts.json")
    return guide["rules"], facts["facts"]


def test_4_5_1a_every_violation_cites_existing_rule_or_fact():
    """
    §4.5.1(a): Every Violation-tier finding cites a rule or fact ID that exists in the active set.
    Also verifies that a hallucinated rule ID is downgraded to Advisory and P05 Fact-in-Rule-Field is recovered.
    """
    rules, facts = _get_northwind_rules_and_facts()
    active_rule_ids = {r["rule_id"] for r in rules}
    all_fact_ids = {f["fact_id"] for f in facts}

    # 1. Test hallucinated rule ID downgrade (OWASP LLM09)
    hallucinated_finding = {
        "rule_id": "RULE-DOES-NOT-EXIST-999",
        "fact_id": "",
        "source_clause": "Fake Clause",
        "check_type": "semantic_claim",
        "category": "claim",
        "base_severity": "Violation",
        "high_risk": True,
        "span": "Some text",
        "explanation": "Hallucinated rule violation",
    }
    composed_hallucinated = compose_verdict_and_route(hallucinated_finding, active_rule_ids, all_fact_ids)
    assert composed_hallucinated["verdict_tier"] == "Advisory"
    assert composed_hallucinated["citation_verified"] is False

    # 2. Test P05 Fact-ID-in-Rule-Field recovery ('F-OUT-2025' placed in rule_id)
    p05_misaligned = {
        "rule_id": "F-OUT-2025",
        "fact_id": "",
        "source_clause": "Outcomes",
        "check_type": "semantic_claim",
        "category": "claim",
        "base_severity": "Violation",
        "high_risk": True,
        "span": "9 in 10 of our graduates land a new role within six months.",
        "explanation": "Contradicts outcomes report",
    }
    composed_p05 = compose_verdict_and_route(p05_misaligned, active_rule_ids, all_fact_ids)
    assert composed_p05["rule_id"] in active_rule_ids
    assert composed_p05["fact_id"] == "F-OUT-2025"


def test_4_5_1b_unsupported_claim_returns_advisory_never_violation():
    """
    §4.5.1(b) & §4.4 Worked Example:
    A claim with no supporting fact returns Advisory or Needs human, NEVER Violation.
    Tests the exact §4.4 Worked Example: 'Our platform cuts onboarding time by 50%. Join the webinar on 12 Nov.'
    """
    rules, facts = _get_northwind_rules_and_facts()
    text = "Our platform cuts onboarding time by 50%. Join the webinar on 12 Nov."
    res = run_full_verification_pipeline(
        text=text,
        rules=rules,
        facts=facts,
        must_keep_points=["12 Nov", "webinar"],
        origin="ai_generated",
        channel="social",
    )
    assert res["findings_count"] >= 1
    claim_fnd = next(f for f in res["findings"] if f["rule_id"] == "CLAIM-01")
    assert claim_fnd["verdict_tier"] in ("Advisory", "Needs human")
    assert claim_fnd["verdict_tier"] != "Violation"
    assert claim_fnd["fact_id"] == "F-014"
    assert "30 June 2026" in claim_fnd["fact_vault_match"]
    assert claim_fnd["route_to"] == "Authorised Reviewer"
    assert claim_fnd["suggested_fix"] == "Our platform helps teams get started faster. Join the webinar on 12 Nov."
    assert claim_fnd["ipm_score"] >= 0.85


def test_4_5_1c_expired_fact_never_treated_as_support_p13_replay():
    """
    §4.5.1(c) & Hypothesis H4:
    An expired fact is never treated as support (Piece P13 replayed as a test).
    """
    rules, facts = _get_northwind_rules_and_facts()
    p13_text = "Data Foundations takes just 12 weeks. Enrol today."
    res = run_full_verification_pipeline(
        text=p13_text,
        rules=rules,
        facts=facts,
        must_keep_points=["Data Foundations", "Enrol today"],
    )
    assert res["overall_verdict"] == "VIOLATION"
    fact_fnd = next(f for f in res["findings"] if f["rule_id"] == "FACT-01")
    assert fact_fnd["fact_id"] == "F-DUR-01"
    assert "2026-06-30" in fact_fnd["explanation"]
    assert "10 weeks" in fact_fnd["suggested_fix"]


def test_4_5_1d_modality_inflation_up_to_30_published_as_30_flagged():
    """
    §4.5.1(d): 'Up to 30%' published as '30%' or 'always save 30%' is deterministically flagged citing F-SAVE-01.
    """
    rules, facts = _get_northwind_rules_and_facts()
    inflated_text = "Learners on annual plans always save 30% compared with monthly billing. Join by 30 November 2026."
    res = run_full_verification_pipeline(
        text=inflated_text,
        rules=rules,
        facts=facts,
        must_keep_points=["annual plans", "30 November 2026"],
    )
    assert res["overall_verdict"] == "VIOLATION"
    mod_fnd = next(f for f in res["findings"] if f.get("status_code") == "MODALITY_INFLATION")
    assert mod_fnd["fact_id"] == "F-SAVE-01"
    assert "up to 30%" in mod_fnd["suggested_fix"].lower()


def test_4_5_1e_golden_18_pieces_precision_recall_and_stability():
    """
    §4.5.1(e) & Hypotheses H1, H3:
    Evaluates all 18 baseline pieces across 3 reruns (54 runs):
      - 100% precision & 100% recall on expected flags
      - 0 false positives on clean controls (P01, P11, P15, P17)
      - 0 verdict flips across 3 reruns (0% flip rate vs 22.2% plain LLM baseline)
    """
    rules, facts = _get_northwind_rules_and_facts()
    golden = load_json_data("golden_evaluation_set.json")["baseline_18_pieces"]
    active_rule_ids = {r["rule_id"] for r in rules}

    flips = 0
    for piece in golden:
        run_verdicts = []
        for _ in range(3):
            res = run_full_verification_pipeline(
                text=piece["piece_text"],
                rules=rules,
                facts=facts,
                must_keep_points=piece.get("must_keep_points", []),
            )
            is_flagged = res["findings_count"] > 0
            run_verdicts.append(is_flagged)

            # Check every finding cites a valid active rule ID
            for fnd in res["findings"]:
                assert fnd["rule_id"] in active_rule_ids

            # Check required rules are detected
            detected_rules = {fnd["rule_id"] for fnd in res["findings"]}
            for req_r in piece["required_rules"]:
                assert req_r in detected_rules, f"Piece {piece['piece_id']} missed required rule {req_r}"

        assert len(set(run_verdicts)) == 1, f"Piece {piece['piece_id']} flipped across runs"
        assert run_verdicts[0] == piece["expected_flag"], f"Piece {piece['piece_id']} expected {piece['expected_flag']}"

    assert flips == 0
