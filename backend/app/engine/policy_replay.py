# -*- coding: utf-8 -*-
"""Layer 8: Policy Replay Engine & Reviewer Override Rate (ROR) Telemetry (§4.3 Step 10, §4.6, §5.1)."""
from typing import List, Dict, Any
from backend.app.config import ROR_TRAINING_GAP_MAX, ROR_UNCLEAR_GUIDELINE_MIN
from backend.app.engine.deterministic import run_deterministic_text_checks


def run_policy_replay_for_rule(
    proposed_rule: Dict[str, Any],
    existing_rules: List[Dict[str, Any]],
    corpus_pieces: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Replays a proposed deterministic rule edit across stored historical/golden pieces
    before the edit goes live (§4.3 Step 10 & §5.1 MVP).
    """
    target_rule_id = proposed_rule["rule_id"]

    # Build before and after rule sets
    before_rules = [r for r in existing_rules if r.get("active", True)]
    after_rules = []
    replaced = False
    for r in before_rules:
        if r["rule_id"] == target_rule_id:
            after_rules.append(proposed_rule)
            replaced = True
        else:
            after_rules.append(r)
    if not replaced:
        after_rules.append(proposed_rule)

    changed_pieces: List[Dict[str, Any]] = []
    newly_flagged_count = 0
    newly_cleared_count = 0

    for piece in corpus_pieces:
        p_id = piece.get("piece_id") or piece.get("asset_id") or "UNKNOWN"
        text = piece.get("piece_text") or piece.get("current_content") or piece.get("raw_content") or ""

        before_findings = [
            f for f in run_deterministic_text_checks(text, before_rules)
            if f["rule_id"] == target_rule_id
        ]
        after_findings = [
            f for f in run_deterministic_text_checks(text, after_rules)
            if f["rule_id"] == target_rule_id
        ]

        before_verdict = "FLAGGED" if before_findings else "PASS"
        after_verdict = "FLAGGED" if after_findings else "PASS"

        if before_verdict != after_verdict:
            if after_verdict == "FLAGGED":
                newly_flagged_count += 1
                direction = "PASS -> FLAGGED"
            else:
                newly_cleared_count += 1
                direction = "FLAGGED -> PASS"

            changed_pieces.append({
                "piece_id": p_id,
                "before_verdict": before_verdict,
                "after_verdict": after_verdict,
                "direction": direction,
                "matched_spans": [f["span"] for f in after_findings] or [f["span"] for f in before_findings],
                "snippet": text[:110] + ("..." if len(text) > 110 else ""),
            })

    return {
        "rule_id": target_rule_id,
        "corpus_size": len(corpus_pieces),
        "total_verdict_changes": len(changed_pieces),
        "newly_flagged_count": newly_flagged_count,
        "newly_cleared_count": newly_cleared_count,
        "changed_pieces": changed_pieces,
    }


def compute_ror_telemetry(
    findings: List[Dict[str, Any]],
    rules: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Computes Reviewer Override Rate (ROR) per rule (§4.6):
      ROR(rule) = dismissed_flags / total_flags
      - ROR < 15% with >= 2 flags -> Creator training gap
      - ROR > 45% with >= 2 flags -> Unclear guideline candidate for Brand Admin review
    """
    stats_by_rule: Dict[str, Dict[str, Any]] = {}
    for r in rules:
        r_id = r["rule_id"]
        stats_by_rule[r_id] = {
            "rule_id": r_id,
            "source_clause": r.get("source_clause", r_id),
            "category": r.get("category", "general"),
            "description": r.get("description", ""),
            "total_flags": 0,
            "dismissed_or_overridden": 0,
            "accepted_or_confirmed": 0,
            "disputed_count": 0,
            "ror": 0.0,
            "diagnostic_status": "NO_DATA",
            "recommendation": "Insufficient flag volume to classify.",
        }

    for f in findings:
        r_id = f.get("rule_id", "UNKNOWN")
        if r_id not in stats_by_rule:
            stats_by_rule[r_id] = {
                "rule_id": r_id,
                "source_clause": f.get("source_clause", r_id),
                "category": f.get("category", "general"),
                "description": "",
                "total_flags": 0,
                "dismissed_or_overridden": 0,
                "accepted_or_confirmed": 0,
                "disputed_count": 0,
                "ror": 0.0,
                "diagnostic_status": "NO_DATA",
                "recommendation": "",
            }

        bucket = stats_by_rule[r_id]
        bucket["total_flags"] += 1
        status = f.get("status", "OPEN")
        rev_action = f.get("reviewer_action", "")

        if status in ("OVERRIDDEN", "WAIVED") or rev_action in ("OVERRIDE", "WAIVER"):
            bucket["dismissed_or_overridden"] += 1
        elif status in ("ACCEPTED_FIX", "RESOLVED") or rev_action == "CONFIRM":
            bucket["accepted_or_confirmed"] += 1
        if status == "DISPUTED" or f.get("creator_action") == "DISPUTE":
            bucket["disputed_count"] += 1

    unclear_candidates = []
    training_gaps = []

    for r_id, item in stats_by_rule.items():
        tot = item["total_flags"]
        if tot == 0:
            continue
        ror = round(item["dismissed_or_overridden"] / float(tot), 3)
        item["ror"] = ror
        if tot >= 2 and ror > ROR_UNCLEAR_GUIDELINE_MIN:
            item["diagnostic_status"] = "UNCLEAR_GUIDELINE_CANDIDATE"
            item["recommendation"] = (
                f"High override rate ({ror * 100:.1f}% > 45%). Reviewers frequently dismiss this rule; "
                f"inspect {r_id} in Guideline Lab for ambiguity or missing exceptions."
            )
            unclear_candidates.append(r_id)
        elif tot >= 2 and ror < ROR_TRAINING_GAP_MAX:
            item["diagnostic_status"] = "CREATOR_TRAINING_GAP"
            item["recommendation"] = (
                f"Low override rate ({ror * 100:.1f}% < 15%) with recurring violations ({tot} flags). "
                f"Rule is clear; provide creator pre-flight templates."
            )
            training_gaps.append(r_id)
        else:
            item["diagnostic_status"] = "HEALTHY_SPECIFICATION"
            item["recommendation"] = f"Override rate ({ror * 100:.1f}%) within expected operational bounds."

    sorted_rules = sorted(
        stats_by_rule.values(),
        key=lambda x: (x["total_flags"], x["ror"]),
        reverse=True,
    )
    return {
        "rules_telemetry": sorted_rules,
        "unclear_guideline_candidates": unclear_candidates,
        "creator_training_gaps": training_gaps,
    }
