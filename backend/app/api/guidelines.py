# -*- coding: utf-8 -*-
"""API Endpoints for Guideline Import, Brand-AST Compilation, Rule Linting & Policy Replay."""
import json
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from backend.app.models import get_db, RuleModel, append_audit_event
from backend.app.schemas.schemas import RuleCreateSchema, PolicyReplayRequestSchema
from backend.app.seed import get_rules_as_dicts, load_json_data
from backend.app.engine.ast_compiler import compile_markdown_guidelines_to_ast, lint_guideline_rules
from backend.app.engine.policy_replay import run_policy_replay_for_rule

router = APIRouter(prefix="/api/guidelines", tags=["Guidelines & Brand-AST"])


@router.get("/rules")
def list_rules(tenant: str = "northwind_academy", db: Session = Depends(get_db)):
    guide_meta = load_json_data("northwind_guide.json")
    rules = get_rules_as_dicts(db, tenant=tenant)
    return {
        "tenant": tenant,
        "guide_name": guide_meta.get("guide_name", "Northwind Academy Brand Guide"),
        "version": guide_meta.get("version", "v1.0.0"),
        "brand_palette": guide_meta.get("brand_palette", []),
        "logo_spec": guide_meta.get("logo_spec", {}),
        "rules_count": len(rules),
        "rules": rules,
    }


@router.post("/import-markdown")
def import_markdown_guidelines(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Compiles prose/Markdown brand rules into structured Brand-AST objects for human confirmation (§4.3 Step 1)."""
    md_text = payload.get("markdown", "")
    tenant = payload.get("tenant", "northwind_academy")
    compiled = compile_markdown_guidelines_to_ast(md_text, tenant=tenant)
    lint_report = lint_guideline_rules(compiled)
    return {
        "compiled_count": len(compiled),
        "compiled_rules": compiled,
        "lint_report": lint_report,
    }


@router.post("/lint")
def lint_rules_endpoint(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
):
    """
    Runs the Guideline Linter (§4.3 Step 1 & Hypothesis H5).
    When include_seeded_defects=True, includes the 3 seeded defect rules from northwind_guide.json
    to verify >= 90% seeded defect detection.
    """
    include_seeded = bool(payload.get("include_seeded_defects", True))
    active_rules = get_rules_as_dicts(db)
    guide_meta = load_json_data("northwind_guide.json")
    seeded = guide_meta.get("seeded_defect_rules_for_linter_test", []) if include_seeded else []
    combined = active_rules + seeded

    report = lint_guideline_rules(combined)
    seeded_ids = {r["rule_id"] for r in seeded}
    detected_seeded = [r_id for r_id in report["flagged_rule_ids"] if r_id in seeded_ids]

    report["seeded_defects_total"] = len(seeded_ids)
    report["seeded_defects_detected"] = len(detected_seeded)
    report["seeded_detection_rate"] = round(len(detected_seeded) / float(len(seeded_ids)), 3) if seeded_ids else 1.0
    return report


@router.post("/replay")
def policy_replay_endpoint(
    req: PolicyReplayRequestSchema,
    db: Session = Depends(get_db),
):
    """
    Runs Policy Replay across the 18-piece golden evaluation set before a rule edit goes live (§4.3 Step 10 & §5.1).
    """
    existing_rules = get_rules_as_dicts(db)
    golden = load_json_data("golden_evaluation_set.json")
    corpus = golden.get("baseline_18_pieces", [])

    proposed_rule = {
        "rule_id": req.rule_id,
        "modality": req.proposed_modality,
        "category": "terminology",
        "check_type": "deterministic",
        "severity": req.proposed_severity,
        "high_risk": False,
        "source_clause": f"Policy Replay Draft [{req.rule_id}]",
        "description": req.description or f"Modified rule {req.rule_id}",
        "patterns": req.proposed_patterns,
        "active": True,
    }

    replay_res = run_policy_replay_for_rule(
        proposed_rule=proposed_rule,
        existing_rules=existing_rules,
        corpus_pieces=corpus,
    )
    return replay_res


@router.post("/rules")
def upsert_rule(
    req: RuleCreateSchema,
    db: Session = Depends(get_db),
):
    """Creates or updates a Brand-AST rule (Brand Admin action) and logs to the hash-chained audit trail."""
    existing = db.query(RuleModel).filter(RuleModel.rule_id == req.rule_id).first()
    if existing:
        existing.modality = req.modality
        existing.category = req.category
        existing.check_type = req.check_type
        existing.severity = req.severity
        existing.high_risk = req.high_risk
        existing.source_clause = req.source_clause
        existing.description = req.description
        existing.patterns_json = json.dumps(req.patterns)
        existing.examples_json = json.dumps(req.examples)
        existing.version = req.version
        existing.active = req.active
    else:
        db.add(
            RuleModel(
                rule_id=req.rule_id,
                tenant=req.tenant,
                version=req.version,
                modality=req.modality,
                category=req.category,
                check_type=req.check_type,
                severity=req.severity,
                high_risk=req.high_risk,
                source_clause=req.source_clause,
                description=req.description,
                patterns_json=json.dumps(req.patterns),
                examples_json=json.dumps(req.examples),
                owner=req.owner,
                effective_date=req.effective_date,
                active=req.active,
            )
        )
    db.commit()

    audit = append_audit_event(
        db=db,
        actor_name=req.owner,
        actor_role="Brand Admin",
        event_type="UPSERT_RULE",
        target_id=req.rule_id,
        details={"modality": req.modality, "severity": req.severity, "version": req.version},
        rule_set_version=req.version,
    )
    return {"status": "ok", "rule_id": req.rule_id, "audit_block_hash": audit.block_hash}


@router.get("/jurisdictions")
def get_supported_jurisdictions():
    """
    Improvement 2 (§Round 3): Returns supported global advertising compliance jurisdictions
    (US FTC, EU AI Act, UK CMA/ASA, Global) and their statutory clauses.
    """
    from backend.app.engine.regulatory_matrix import list_supported_jurisdictions
    return {
        "status": "ok",
        "jurisdictions": list_supported_jurisdictions(),
    }

