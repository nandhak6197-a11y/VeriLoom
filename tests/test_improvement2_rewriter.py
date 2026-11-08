# -*- coding: utf-8 -*-
"""Acceptance Tests for Improvement 2: Intent-Locked Surgical Rewriting & IPM (§4.5.2 & H6)."""
from backend.app.engine.surgical_rewriter import (
    compute_ipm_score,
    check_must_keep_points,
    generate_surgical_suggestion,
)
from backend.app.seed import load_json_data
from backend.app.engine.pipeline import run_full_verification_pipeline


def test_4_5_2a_suggestion_dropping_must_keep_point_is_rejected_and_regenerated():
    """
    §4.5.2(a) & Hypothesis H6:
    A suggestion that drops a must-keep point is rejected by Intent Lock and regenerated keeping all points.
    """
    original = "Our platform cuts onboarding time by 50% for the 12 Nov webinar."
    bad_finding = {
        "rule_id": "CLAIM-01",
        "span": "cuts onboarding time by 50% for the 12 Nov webinar.",
        "replacement_span": "helps teams get started faster.",  # Drops '12 Nov webinar'
    }
    res = generate_surgical_suggestion(
        full_text=original,
        finding=bad_finding,
        must_keep_points=["12 Nov webinar"],
    )
    assert res["regenerated_by_lock"] is True
    assert res["must_keep_preserved"] is True
    assert "12 nov webinar" in res["suggested_fix"].lower()


def test_4_5_2b_tracked_changes_and_rationale():
    """
    §4.5.2(b): Suggestions appear as tracked changes ([-removed-] {+added+}) with a rationale.
    """
    original = "Our platform cuts onboarding time by 50%. Join the webinar on 12 Nov."
    finding = {
        "rule_id": "CLAIM-01",
        "span": "cuts onboarding time by 50%",
        "replacement_span": "helps teams get started faster",
    }
    res = generate_surgical_suggestion(
        full_text=original,
        finding=finding,
        must_keep_points=["12 Nov", "webinar"],
    )
    assert "[-cuts onboarding time by 50%-]" in res["tracked_change"]
    assert "{+helps teams get started faster+}" in res["tracked_change"]
    assert res["ipm_score"] >= 0.85


def test_4_5_2d_ipm_threshold_on_golden_set():
    """
    §4.5.2(d) & Hypothesis H6:
    Verifies IPM scores and 100% must-keep preservation across the 18-piece golden test set.
    """
    guide = load_json_data("northwind_guide.json")
    facts = load_json_data("northwind_facts.json")
    golden = load_json_data("golden_evaluation_set.json")["baseline_18_pieces"]

    total_suggestions = 0
    meeting_ipm = 0
    preserving_must_keep = 0

    for piece in golden:
        res = run_full_verification_pipeline(
            text=piece["piece_text"],
            rules=guide["rules"],
            facts=facts["facts"],
            must_keep_points=piece.get("must_keep_points", []),
        )
        for fnd in res["findings"]:
            total_suggestions += 1
            if fnd["ipm_score"] >= 0.85:
                meeting_ipm += 1
            if fnd["must_keep_preserved"]:
                preserving_must_keep += 1
            chk = check_must_keep_points(
                piece["piece_text"],
                fnd["suggested_fix"],
                piece.get("must_keep_points", []),
            )
            assert chk["all_preserved"] is True

    assert total_suggestions >= 14
    assert preserving_must_keep == total_suggestions  # 100% H6 preservation
    assert (meeting_ipm / float(total_suggestions)) >= 0.90
