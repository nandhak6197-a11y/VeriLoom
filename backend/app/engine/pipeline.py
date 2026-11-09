# -*- coding: utf-8 -*-
"""Unified 9-Layer Verification Pipeline Orchestrator (§4.3 & §5.2)."""
import uuid
from datetime import date
from typing import List, Dict, Any
from backend.app.config import DEFAULT_REVIEW_DATE
from backend.app.engine.ingestion import compute_sha256_text, normalize_text
from backend.app.engine.privacy_masker import mask_sensitive_content, build_ai_disclosure_receipt
from backend.app.engine.deterministic import run_deterministic_text_checks, compute_readability
from backend.app.engine.claim_verifier import verify_claims_and_semantics
from backend.app.engine.verdict_composer import compose_verdict_and_route
from backend.app.engine.surgical_rewriter import generate_surgical_suggestion
from backend.app.engine.regulatory_matrix import evaluate_regulatory_compliance


def run_full_verification_pipeline(
    text: str,
    rules: List[Dict[str, Any]],
    facts: List[Dict[str, Any]],
    must_keep_points: List[str] = None,
    origin: str = "employee",
    channel: str = "social",
    jurisdiction: str = "US",
    review_date: date = None,
    confidential_terms: List[str] = None,
    rule_set_version: str = "v1.0.0",
) -> Dict[str, Any]:
    """
    Executes the complete VeriLoom verification pipeline including cross-border
    regulatory matrix evaluation (§Round 3 Improvement 2).
    """
    if must_keep_points is None:
        must_keep_points = []
    if review_date is None:
        review_date = DEFAULT_REVIEW_DATE

    # Step 1: Normalize & Fingerprint (Layer 1)
    original_sha256 = compute_sha256_text(text)
    normalized_text = normalize_text(text)
    normalized_sha256 = compute_sha256_text(normalized_text)
    readability = compute_readability(normalized_text)

    # Step 2: Protect - PII & Confidential Term Masking + OWASP LLM01 Sandboxing (Layer 1 & 9)
    mask_res = mask_sensitive_content(normalized_text, confidential_terms=confidential_terms)

    # Active Rule and Fact ID sets for Layer 3 Citation Verification
    active_rules = [r for r in rules if r.get("active", True)]
    active_rule_ids = {r["rule_id"] for r in active_rules}
    all_fact_ids = {f["fact_id"] for f in facts}

    # Step 3: Deterministic Checks (Layer 2)
    det_findings = run_deterministic_text_checks(normalized_text, active_rules)

    # Step 4: Grounded Semantic & Fact Vault Checks (Layer 3 & 4)
    # Content is evaluated strictly as data; prompt-injection strings never alter the verdict
    sem_findings = verify_claims_and_semantics(
        text=normalized_text,
        rules=active_rules,
        facts=facts,
        review_date=review_date,
    )

    # Step 4B: Multi-Jurisdiction Regulatory Matrix Checks (§Round 3 Improvement 2)
    reg_findings = evaluate_regulatory_compliance(
        text=normalized_text,
        origin=origin,
        channel=channel,
        jurisdiction=jurisdiction,
    )

    raw_findings = det_findings + sem_findings + reg_findings

    # Step 5 & 6: Stability Gate, Code-Composed Verdicts, Risk Routing & Surgical IPM Rewrites (Layer 5 & 6)
    composed_findings: List[Dict[str, Any]] = []
    for idx, rf in enumerate(raw_findings):
        composed = compose_verdict_and_route(
            raw_finding=rf,
            active_rule_ids=active_rule_ids,
            all_fact_ids=all_fact_ids,
            origin=origin,
        )
        suggestion = generate_surgical_suggestion(
            full_text=normalized_text,
            finding=composed,
            must_keep_points=must_keep_points,
        )
        composed["finding_id"] = rf.get("finding_id") or f"FND-{uuid.uuid4().hex[:8].upper()}"
        composed["suggested_fix"] = suggestion["suggested_fix"]
        composed["tracked_change"] = suggestion["tracked_change"]
        composed["ipm_score"] = suggestion["ipm_score"]
        composed["must_keep_preserved"] = suggestion["must_keep_preserved"]
        composed["passes_ipm"] = suggestion["passes_ipm"]
        composed["intent_lock_note"] = suggestion["intent_lock_note"]
        composed_findings.append(composed)

    # Determine Overall Verdict & Assigned Reviewer Role
    tiers = [f["verdict_tier"] for f in composed_findings]
    if "Violation" in tiers:
        overall_verdict = "VIOLATION"
    elif "Needs human" in tiers:
        overall_verdict = "NEEDS_HUMAN"
    elif "Advisory" in tiers:
        overall_verdict = "ADVISORY"
    else:
        overall_verdict = "PASS"

    routes = {f["route_to"] for f in composed_findings}
    if "Authorised Reviewer" in routes or origin in ("agency", "ai_generated") and composed_findings:
        assigned_role = "Authorised Reviewer"
    else:
        assigned_role = "Brand Manager"

    # Build AI Disclosure Receipt (Layer 9)
    models_used = ["typeform/distilbert-base-uncased-mnli (66.96M params, Local PyTorch NLI & 768-dim Embedder)"] if (sem_findings or raw_findings) else []
    receipt = build_ai_disclosure_receipt(
        mask_result=mask_res,
        models_invoked=models_used,
        rule_set_version=rule_set_version,
        external_data_sent=False,
    )

    return {
        "original_sha256": original_sha256,
        "normalized_sha256": normalized_sha256,
        "normalized_content": normalized_text,
        "readability": readability,
        "overall_verdict": overall_verdict,
        "assigned_role": assigned_role,
        "findings_count": len(composed_findings),
        "jurisdiction": jurisdiction,
        "findings": composed_findings,
        "receipt": receipt,
        "mask_summary": mask_res,
    }
