# -*- coding: utf-8 -*-
"""Acceptance Tests for Guideline Linter (H5), Markdown AST Compiler, Policy Replay & ROR Telemetry."""
from backend.app.seed import load_json_data
from backend.app.engine.ast_compiler import compile_markdown_guidelines_to_ast, lint_guideline_rules
from backend.app.engine.policy_replay import run_policy_replay_for_rule, compute_ror_telemetry


def test_h5_guideline_linter_detects_seeded_defects():
    """
    Hypothesis H5: Guideline Linter finds >= 90% of seeded specification defects:
      - DEFECT-VAGUE-01 (vague buzzwords + missing examples)
      - DEFECT-CONTRADICT-01 (requires 'students', contradicting TERM-01 FORBIDDEN 'students')
      - DEFECT-OVERLAP-01 (duplicates TERM-02 forbidden term 'cheap')
    """
    guide = load_json_data("northwind_guide.json")
    active = guide["rules"]
    seeded = guide["seeded_defect_rules_for_linter_test"]
    report = lint_guideline_rules(active + seeded)

    seeded_ids = {r["rule_id"] for r in seeded}
    caught = seeded_ids.intersection(set(report["flagged_rule_ids"]))
    assert len(caught) == len(seeded_ids)  # 3/3 = 100% (>= 90% H5 target)

    defect_types = {d["defect_type"] for d in report["defects"]}
    assert "CONTRADICTORY_RULES" in defect_types
    assert "UNCHECKABLE_VAGUE_CLAUSE" in defect_types
    assert "MISSING_EXAMPLES" in defect_types
    assert "OVERLAPPING_SCOPE" in defect_types


def test_policy_replay_identifies_verdict_changes_before_publish():
    """
    §4.3 Step 10 & §5.1: Policy Replay shows which stored pieces change verdict when a rule is edited.
    For example, adding 'tutors' to TERM-01 forbidden terms causes clean control P11 ('Our tutors answer questions...')
    to flip from PASS -> FLAGGED.
    """
    guide = load_json_data("northwind_guide.json")
    golden = load_json_data("golden_evaluation_set.json")["baseline_18_pieces"]

    proposed_rule = {
        "rule_id": "TERM-01",
        "modality": "FORBIDDEN",
        "category": "terminology",
        "check_type": "deterministic",
        "severity": "Violation",
        "source_clause": "Terminology §1.1 [TERM-01]",
        "description": "Test policy replay adding 'tutors' to forbidden terms",
        "patterns": {"forbidden_terms": ["students", "student", "tutors"]},
        "active": True,
    }

    replay = run_policy_replay_for_rule(
        proposed_rule=proposed_rule,
        existing_rules=guide["rules"],
        corpus_pieces=golden,
    )
    assert replay["total_verdict_changes"] >= 1
    flipped_ids = {p["piece_id"] for p in replay["changed_pieces"]}
    assert "P11" in flipped_ids


def test_ror_telemetry_separates_unclear_rules_from_training_gaps():
    """
    §4.6 & Hypothesis H5:
    ROR < 15% with recurring flags -> CREATOR_TRAINING_GAP
    ROR > 45% with recurring flags -> UNCLEAR_GUIDELINE_CANDIDATE
    """
    guide = load_json_data("northwind_guide.json")
    sample_findings = [
        {"rule_id": "TERM-01", "status": "ACCEPTED_FIX", "reviewer_action": "CONFIRM"},
        {"rule_id": "TERM-01", "status": "ACCEPTED_FIX", "reviewer_action": "CONFIRM"},
        {"rule_id": "TERM-01", "status": "ACCEPTED_FIX", "reviewer_action": "CONFIRM"},
        {"rule_id": "TONE-01", "status": "OVERRIDDEN", "reviewer_action": "OVERRIDE"},
        {"rule_id": "TONE-01", "status": "OVERRIDDEN", "reviewer_action": "OVERRIDE"},
        {"rule_id": "TONE-01", "status": "ACCEPTED_FIX", "reviewer_action": "CONFIRM"},
    ]
    report = compute_ror_telemetry(sample_findings, guide["rules"])
    assert "TERM-01" in report["creator_training_gaps"]
    assert "TONE-01" in report["unclear_guideline_candidates"]


def test_markdown_guideline_compiler():
    md = """## Terminology
- TERM-01: Write "learners" in external copy. Do not use "students".
- TERM-02: Do not use "cheap". Use "affordable".
"""
    compiled = compile_markdown_guidelines_to_ast(md)
    assert len(compiled) == 2
    assert compiled[0]["rule_id"] == "TERM-01"
    assert compiled[0]["modality"] == "FORBIDDEN"
    assert "students" in compiled[0]["patterns"]["forbidden_terms"]
