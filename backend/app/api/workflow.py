# -*- coding: utf-8 -*-
"""API Endpoints for Layer 7: Four-Role Workflow, Intent Lock Edits, Waivers & Human-Only Approval."""
import json
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.config import WAIVER_REASON_CODES
from backend.app.models import get_db, AssetModel, FindingModel, AuditLogModel, append_audit_event
from backend.app.schemas.schemas import (
    CreatorFindingActionSchema,
    ReviewerDecisionSchema,
    AssetApprovalSchema,
)
from backend.app.engine.ingestion import compute_sha256_text
from backend.app.engine.surgical_rewriter import check_must_keep_points, compute_ipm_score

router = APIRouter(prefix="/api/workflow", tags=["Workflow & Human Oversight"])


def _extract_single_finding_replacement(base_text: str, suggested_fix: str):
    """
    Extracts the exact (old_span, new_span) pair that generate_surgical_suggestion
    replaced in base_text to produce suggested_fix.
    """
    if not base_text or not suggested_fix or base_text == suggested_fix:
        return None, None
    min_len = min(len(base_text), len(suggested_fix))
    prefix_len = 0
    while prefix_len < min_len and base_text[prefix_len] == suggested_fix[prefix_len]:
        prefix_len += 1
    suffix_len = 0
    while (
        suffix_len < (min_len - prefix_len)
        and base_text[len(base_text) - 1 - suffix_len] == suggested_fix[len(suggested_fix) - 1 - suffix_len]
    ):
        suffix_len += 1
    old_span = base_text[prefix_len : len(base_text) - suffix_len]
    new_span = suggested_fix[prefix_len : len(suggested_fix) - suffix_len]
    return old_span, new_span


def _recompute_cumulative_working_copy(asset: AssetModel, all_findings: list) -> str:
    """
    Sequentially applies every accepted finding's surgical span replacement onto the base draft
    so accepting multiple findings on the same submission accumulates all accepted fixes.
    """
    base_text = asset.normalized_content or asset.raw_content or ""
    working = base_text

    for f in all_findings:
        if f.status != "ACCEPTED_FIX":
            continue
        old_span, new_span = _extract_single_finding_replacement(base_text, f.suggested_fix or "")
        if old_span and old_span in working:
            working = working.replace(old_span, new_span, 1)
    return working


@router.post("/creator-action")
def creator_finding_action(
    req: CreatorFindingActionSchema,
    db: Session = Depends(get_db),
):
    """
    Step 7 of Workflow (§4.3): Creator responds to a finding by:
      - ACCEPT: Explicitly clicks to apply the surgical tracked-change fix (accumulated across all accepted findings).
      - EDIT: Supplies a custom edit; Intent Lock verifies all must-keep points are retained (§4.5.2a).
      - DISPUTE: Disputes the finding with a rationale, routing it to human review.
      - UNDO: Reverts a previously accepted fix back to OPEN and recomputes the cumulative working copy.
    """
    finding = db.query(FindingModel).filter(FindingModel.finding_id == req.finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding {req.finding_id} not found")

    asset = db.query(AssetModel).filter(AssetModel.asset_id == finding.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Parent asset not found")

    all_findings = (
        db.query(FindingModel)
        .filter(FindingModel.asset_id == asset.asset_id)
        .order_by(FindingModel.id.asc())
        .all()
    )

    must_keep = json.loads(asset.must_keep_points_json or "[]")
    action = req.action.upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    if action == "ACCEPT":
        finding.status = "ACCEPTED_FIX"
        finding.creator_action = "ACCEPT"
        finding.creator_comment = req.comment or "Creator accepted surgical tracked-change suggestion."
        new_text = _recompute_cumulative_working_copy(asset, all_findings)
        # Verify Intent Lock before applying
        lock_check = check_must_keep_points(asset.normalized_content or asset.raw_content, new_text, must_keep)
        if not lock_check["all_preserved"]:
            finding.status = "OPEN"
            finding.creator_action = ""
            raise HTTPException(
                status_code=400,
                detail=f"Intent Lock blocked edit: missing must-keep point(s): {lock_check['missing_points']}",
            )
        asset.current_content = new_text
        asset.normalized_sha256 = compute_sha256_text(new_text)

    elif action == "EDIT":
        if not req.custom_edit:
            raise HTTPException(status_code=400, detail="custom_edit text is required for EDIT action")
        lock_check = check_must_keep_points(asset.raw_content, req.custom_edit, must_keep)
        if not lock_check["all_preserved"]:
            raise HTTPException(
                status_code=400,
                detail=f"Intent Lock rejected custom edit because it dropped must-keep point(s): {lock_check['missing_points']}",
            )
        ipm_res = compute_ipm_score(asset.current_content, req.custom_edit)
        asset.current_content = req.custom_edit
        asset.normalized_sha256 = compute_sha256_text(req.custom_edit)
        finding.status = "ACCEPTED_FIX"
        finding.creator_action = "EDIT"
        finding.ipm_score = ipm_res["ipm_score"]
        finding.creator_comment = req.comment or "Creator supplied Intent-Locked custom revision."

    elif action == "DISPUTE":
        finding.status = "DISPUTED"
        finding.creator_action = "DISPUTE"
        finding.creator_comment = req.comment or "Creator disputed finding; escalated to human reviewer."
        asset.current_content = _recompute_cumulative_working_copy(asset, all_findings)
        asset.normalized_sha256 = compute_sha256_text(asset.current_content)

    elif action == "UNDO":
        finding.status = "OPEN"
        finding.creator_action = ""
        finding.creator_comment = "Creator reverted surgical fix back to original draft."
        asset.current_content = _recompute_cumulative_working_copy(asset, all_findings)
        asset.normalized_sha256 = compute_sha256_text(asset.current_content)

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported creator action: {action}")

    # Append revision entry
    revisions = json.loads(asset.revisions_json or "[]")
    revisions.append({
        "version": len(revisions) + 1,
        "timestamp": now_iso,
        "author": req.actor_name,
        "role": req.actor_role,
        "note": f"Finding {finding.finding_id} ({finding.rule_id}): {action}",
        "content": asset.current_content,
        "sha256": asset.normalized_sha256,
    })
    asset.revisions_json = json.dumps(revisions)
    db.commit()

    audit = append_audit_event(
        db=db,
        actor_name=req.actor_name,
        actor_role=req.actor_role,
        event_type=f"CREATOR_{action}",
        target_id=finding.finding_id,
        details={
            "asset_id": asset.asset_id,
            "rule_id": finding.rule_id,
            "new_sha256": asset.normalized_sha256,
            "comment": finding.creator_comment,
        },
        rule_set_version=asset.rule_set_version,
    )

    return {
        "status": "ok",
        "finding_id": finding.finding_id,
        "finding_status": finding.status,
        "current_content": asset.current_content,
        "current_sha256": asset.normalized_sha256,
        "audit_block_hash": audit.block_hash,
    }


@router.post("/reviewer-decision")
def reviewer_finding_decision(
    req: ReviewerDecisionSchema,
    db: Session = Depends(get_db),
):
    """
    Step 8 of Workflow (§4.3): Manager or Authorised Reviewer acts on a finding:
      - CONFIRM: Upholds the flag (requires creator fix before approval).
      - OVERRIDE: Dismisses the AI finding with a mandatory reason_code (feeds ROR telemetry).
      - WAIVER: Grants a Justified Rule Waiver with reason_code and business rationale.
    """
    if req.actor_role not in ("Brand Manager", "Authorised Reviewer", "Brand Admin"):
        raise HTTPException(
            status_code=403,
            detail="Only a Brand Manager, Authorised Reviewer, or Brand Admin can override or waive findings.",
        )

    finding = db.query(FindingModel).filter(FindingModel.finding_id == req.finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail=f"Finding {req.finding_id} not found")

    # High-risk or Needs human items require Authorised Reviewer
    if (finding.high_risk or finding.verdict_tier == "Needs human") and req.actor_role == "Brand Manager" and req.action.upper() in ("OVERRIDE", "WAIVER"):
        raise HTTPException(
            status_code=403,
            detail=f"Finding {finding.finding_id} ({finding.rule_id}) is high-risk/escalated and requires an Authorised Reviewer to waive or override.",
        )

    action = req.action.upper()
    if action in ("OVERRIDE", "WAIVER"):
        if req.reason_code not in WAIVER_REASON_CODES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid reason_code '{req.reason_code}'. Must be one of {list(WAIVER_REASON_CODES.keys())}.",
            )
        finding.status = "WAIVED" if action == "WAIVER" else "OVERRIDDEN"
        finding.reviewer_action = action
        finding.override_reason_code = req.reason_code
        finding.override_comment = req.comment or WAIVER_REASON_CODES[req.reason_code]
    elif action == "CONFIRM":
        finding.status = "OPEN"
        finding.reviewer_action = "CONFIRM"
        finding.override_comment = req.comment or "Reviewer upheld finding."
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported reviewer action: {action}")

    db.commit()

    audit = append_audit_event(
        db=db,
        actor_name=req.actor_name,
        actor_role=req.actor_role,
        event_type=f"REVIEWER_{action}",
        target_id=finding.finding_id,
        details={
            "asset_id": finding.asset_id,
            "rule_id": finding.rule_id,
            "reason_code": finding.override_reason_code,
            "comment": finding.override_comment,
        },
        rule_set_version=finding.rule_version,
    )

    return {
        "status": "ok",
        "finding_id": finding.finding_id,
        "finding_status": finding.status,
        "reviewer_action": finding.reviewer_action,
        "reason_code": finding.override_reason_code,
        "audit_block_hash": audit.block_hash,
    }


@router.post("/approve")
def approve_or_reject_asset(
    req: AssetApprovalSchema,
    db: Session = Depends(get_db),
):
    """
    Step 9 of Workflow (§4.3 & §6.1):
    Only a human reviewer (Brand Manager or Authorised Reviewer) can set Approved.
    Stores a SHA-256 fingerprint of the approved version and the rule-set version in the hash-chained audit log.
    """
    if req.actor_role not in ("Brand Manager", "Authorised Reviewer", "Brand Admin"):
        raise HTTPException(
            status_code=403,
            detail="Role violation: Creators and automated models cannot approve assets. Only Brand Manager or Authorised Reviewer may approve.",
        )

    asset = db.query(AssetModel).filter(AssetModel.asset_id == req.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset {req.asset_id} not found")

    findings = db.query(FindingModel).filter(FindingModel.asset_id == req.asset_id).all()
    decision = req.decision.upper()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Idempotency Guard (§Task 2.1)
    current_fp = compute_sha256_text(asset.current_content)
    if decision == "APPROVE" and asset.status == "APPROVED" and asset.approved_sha256 == current_fp:
        latest_audit = db.query(AuditLogModel).filter(
            AuditLogModel.target_id == asset.asset_id,
            AuditLogModel.event_type == "APPROVE_ASSET"
        ).order_by(AuditLogModel.id.desc()).first()
        return {
            "status": "ok",
            "asset_id": asset.asset_id,
            "asset_status": asset.status,
            "approved_sha256": asset.approved_sha256,
            "approved_by": asset.approved_by,
            "approved_at": asset.approved_at,
            "rule_set_version": asset.rule_set_version,
            "audit_block_hash": latest_audit.block_hash if latest_audit else "",
            "idempotent_skip": True,
            "message": "Asset is already approved with identical SHA-256 fingerprint; idempotent skip.",
        }
    elif decision == "REJECT" and asset.status == "REJECTED":
        latest_audit = db.query(AuditLogModel).filter(
            AuditLogModel.target_id == asset.asset_id,
            AuditLogModel.event_type == "REJECT_ASSET"
        ).order_by(AuditLogModel.id.desc()).first()
        return {
            "status": "ok",
            "asset_id": asset.asset_id,
            "asset_status": asset.status,
            "approved_sha256": "",
            "approved_by": "",
            "approved_at": "",
            "rule_set_version": asset.rule_set_version,
            "audit_block_hash": latest_audit.block_hash if latest_audit else "",
            "idempotent_skip": True,
        }
    elif decision == "ESCALATE" and asset.status == "ESCALATED_LEGAL":
        latest_audit = db.query(AuditLogModel).filter(
            AuditLogModel.target_id == asset.asset_id,
            AuditLogModel.event_type == "ESCALATE_TO_AUTHORISED_REVIEWER"
        ).order_by(AuditLogModel.id.desc()).first()
        return {
            "status": "ok",
            "asset_id": asset.asset_id,
            "asset_status": asset.status,
            "approved_sha256": "",
            "approved_by": "",
            "approved_at": "",
            "rule_set_version": asset.rule_set_version,
            "audit_block_hash": latest_audit.block_hash if latest_audit else "",
            "idempotent_skip": True,
        }

    # 2. Four-Eyes Segregation of Duties (SoD) Check (§Task 2.2)
    creator_actor = getattr(asset, "created_by_actor", None) or ""
    sod_warning = None
    if decision == "APPROVE" and creator_actor and req.actor_name.strip().lower() == creator_actor.strip().lower():
        sod_warning = "⚠️ Demo Mode: Self-Approval Override Logged"

    if decision == "APPROVE":
        receipt_data = json.loads(asset.receipt_json or "{}")
        has_injection = receipt_data.get("injection_attempts_blocked", 0) > 0 or asset.status == "BLOCKED_SECURITY"
        
        # Only Authorised Reviewer (Legal Reviewer) or Brand Admin can sign off on security-flagged assets
        if has_injection and req.actor_role == "Brand Manager":
            raise HTTPException(
                status_code=403,
                detail="Security Gate: This asset contains OWASP LLM01 prompt injection or security blocks and requires an Authorised Reviewer (Legal Reviewer) or Brand Admin to approve.",
            )

        # Check if any high-risk item requires Authorised Reviewer
        has_high_risk_unresolved = any(
            (f.high_risk or f.verdict_tier == "Needs human") and f.status in ("OPEN", "DISPUTED")
            for f in findings
        )
        if has_high_risk_unresolved and req.actor_role == "Brand Manager":
            raise HTTPException(
                status_code=403,
                detail="This asset has unresolved high-risk or Needs-human findings routed to an Authorised Reviewer.",
            )

        approved_fp = current_fp
        asset.status = "APPROVED"
        asset.approved_sha256 = approved_fp
        asset.approved_by = f"{req.actor_name} ({req.actor_role})"
        asset.approved_at = now_iso
        asset.last_modified_by_actor = req.actor_name
        event_name = "APPROVE_ASSET"

    elif decision == "REJECT":
        asset.status = "REJECTED"
        asset.last_modified_by_actor = req.actor_name
        event_name = "REJECT_ASSET"

    elif decision == "ESCALATE":
        asset.status = "ESCALATED_LEGAL"
        asset.assigned_role = "Authorised Reviewer"
        asset.last_modified_by_actor = req.actor_name
        event_name = "ESCALATE_TO_AUTHORISED_REVIEWER"

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported decision: {decision}")

    db.commit()

    # 3. Clean Empty Schema Fields in Audit Events (§Task 2.3)
    audit_details = {
        "decision": decision,
        "status": asset.status,
        "rule_set_version": asset.rule_set_version,
        "comment": req.comment or "",
    }
    if asset.approved_sha256:
        audit_details["approved_sha256"] = asset.approved_sha256
    if sod_warning:
        audit_details["sod_warning"] = sod_warning

    audit = append_audit_event(
        db=db,
        actor_name=req.actor_name,
        actor_role=req.actor_role,
        event_type=event_name,
        target_id=asset.asset_id,
        details=audit_details,
        rule_set_version=asset.rule_set_version,
    )

    return {
        "status": "ok",
        "asset_id": asset.asset_id,
        "asset_status": asset.status,
        "approved_sha256": asset.approved_sha256,
        "approved_by": asset.approved_by,
        "approved_at": asset.approved_at,
        "rule_set_version": asset.rule_set_version,
        "audit_block_hash": audit.block_hash,
        "sod_warning": sod_warning,
    }
