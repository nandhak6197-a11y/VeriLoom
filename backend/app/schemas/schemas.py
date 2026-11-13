# -*- coding: utf-8 -*-
"""Pydantic v2 Schemas for VeriLoom Round 2 MVP."""
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class RuleCreateSchema(BaseModel):
    rule_id: str
    tenant: str = "northwind_academy"
    version: str = "v1.0.0"
    modality: str = Field(..., description="MUST, FORBIDDEN, or CONDITIONAL")
    category: str = Field(..., description="terminology, claim, tone, visual, accessibility, formatting, privacy")
    check_type: str = Field(..., description="deterministic or semantic")
    severity: str = Field(..., description="Violation, Advisory, or Needs human")
    high_risk: bool = False
    source_clause: str
    description: str
    patterns: Dict[str, Any] = Field(default_factory=dict)
    examples: Dict[str, List[str]] = Field(default_factory=lambda: {"positive": [], "negative": []})
    owner: str = "Brand Admin"
    effective_date: str = "2026-01-01"
    active: bool = True


class FactCreateSchema(BaseModel):
    fact_id: str
    tenant: str = "northwind_academy"
    category: str
    subject: str
    predicate: str
    metric: str
    modality: str = Field(..., description="Hedged, Conditional, or Absolute")
    statement: str
    owner: str = "Academic Registrar"
    source: str
    provenance_hash: Optional[str] = None
    valid_from: str
    valid_until: str


class SubmissionCreateSchema(BaseModel):
    title: str
    tenant: str = "northwind_academy"
    content: str
    content_type: str = "text"
    creator_intent: str = ""
    must_keep_points: List[str] = Field(default_factory=list)
    origin: str = "employee"  # employee, agency, ai_generated
    channel: str = "social"
    jurisdiction: str = "US"  # US, EU, UK, GLOBAL
    review_date: Optional[str] = None
    actor_name: str = "Creator User"
    actor_role: str = "Creator"


class AIDisclosureReceiptSchema(BaseModel):
    deterministic_checks_local: bool = True
    pii_masked_count: int = 0
    confidential_terms_masked_count: int = 0
    injection_attempts_blocked: int = 0
    models_invoked: List[str] = Field(default_factory=list)
    external_data_sent: bool = False
    rule_set_version: str = "v1.0.0"
    citation_hashes_verified: bool = True
    summary_text: str = ""


class FindingResponseSchema(BaseModel):
    finding_id: str
    asset_id: str
    rule_id: str
    fact_id: str = ""
    source_clause: str
    rule_version: str = "v1.0.0"
    check_type: str
    category: str
    verdict_tier: str
    severity: str
    high_risk: bool
    status: str
    span: str
    explanation: str
    extracted_claim: str = ""
    fact_vault_match: str = ""
    stability_note: str
    stability_agreement: float
    route_to: str
    suggested_fix: str = ""
    tracked_change: str = ""
    rationale: str = ""
    ipm_score: float = 1.0
    must_keep_preserved: bool = True
    intent_lock_note: str = ""
    creator_action: str = ""
    creator_comment: str = ""
    reviewer_action: str = ""
    override_reason_code: str = ""
    override_comment: str = ""


class CreatorFindingActionSchema(BaseModel):
    finding_id: str
    action: str = Field(..., description="ACCEPT, EDIT, or DISPUTE")
    custom_edit: Optional[str] = None
    comment: str = ""
    actor_name: str = "Creator User"
    actor_role: str = "Creator"


class ReviewerDecisionSchema(BaseModel):
    finding_id: str
    action: str = Field(..., description="CONFIRM, OVERRIDE, or WAIVER")
    reason_code: str = Field(default="FALSE_POSITIVE", description="FALSE_POSITIVE, CREATIVE_EXCEPTION, APPROVED_PROMO_OVERRIDE, UNCLEAR_RULE")
    comment: str = ""
    actor_name: str = "Reviewer User"
    actor_role: str = "Brand Manager"


class AssetApprovalSchema(BaseModel):
    asset_id: str
    decision: str = Field(..., description="APPROVE, REJECT, or ESCALATE")
    comment: str = ""
    actor_name: str = "Manager User"
    actor_role: str = "Brand Manager"
    demo_override_sod: bool = False
    current_sha256: Optional[str] = None


class PolicyReplayRequestSchema(BaseModel):
    rule_id: str
    proposed_modality: str = "FORBIDDEN"
    proposed_severity: str = "Violation"
    proposed_patterns: Dict[str, Any] = Field(default_factory=dict)
    description: str = ""


# =========================================================================
# ROUND 3 PRODUCTION SCHEMAS (Improvements 1, 2, 3)
# =========================================================================

class KnowledgeSyncRequestSchema(BaseModel):
    source_name: str = "Confluence Release Notes"
    source_type: str = "confluence"
    document_text: str
    tenant: str = "northwind_academy"
    auto_import_facts: bool = True


class RegulatoryDisclosureApplySchema(BaseModel):
    asset_id: str
    rule_id: str
    disclosure_text: str
    placement: str = "append"  # append, prepend, footnote
    actor_name: str = "Creator User"
    actor_role: str = "Creator"


class SafeZoneAuditRequestSchema(BaseModel):
    image_base64: Optional[str] = None
    mode: str = "custom_upload"  # compliant_demo, non_compliant_demo, custom_upload
    logo_bbox: Optional[Dict[str, int]] = None
    min_clearance_ratio: float = 0.5


class SubmissionResponseSchema(BaseModel):
    asset_id: str
    tenant: str = "northwind_academy"
    title: str
    content_type: str = "text"
    raw_content: str
    normalized_content: str
    current_content: str
    creator_intent: str = ""
    must_keep_points: List[str] = Field(default_factory=list)
    origin: str = "employee"
    channel: str = "social"
    jurisdiction: str = "US"  # US, EU, UK, GLOBAL
    status: str = "SUBMITTED"
    assigned_role: str = "Brand Manager"
    overall_verdict: str = "PASS"
    original_sha256: str
    normalized_sha256: str
    approved_sha256: str = ""
    approved_by: str = ""
    approved_at: str = ""
    rule_set_version: str = "v1.0.0"
    receipt: Dict[str, Any] = Field(default_factory=dict)
    revisions: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str
    findings_count: int = 0
    findings: List[Dict[str, Any]] = Field(default_factory=list)
    audit_block_hash: Optional[str] = None



class ChatClientContextSchema(BaseModel):
    active_tab: str = 'workbench'
    active_asset_id: Optional[str] = None
    actor_name: str = 'Nandha K'
    actor_role: str = 'Creator'
    detail_mode: str = 'simple'
    draft_title: str = ''
    draft_content: str = ''
    must_keep_points: List[str] = Field(default_factory=list)


class ChatMessageRequestSchema(BaseModel):
    session_id: str = 'default'
    message: str
    allow_actions: bool = True
    model_preference: str = 'auto'
    reasoning_effort: str = 'low'
    image_data_url: Optional[str] = None
    document_data_url: Optional[str] = None
    document_filename: Optional[str] = None
    client_context: ChatClientContextSchema = Field(default_factory=ChatClientContextSchema)


class ChatMemoryUpdateSchema(BaseModel):
    session_id: str = 'default'
    auto_execute_cua: Optional[bool] = None
    forget_fact: Optional[str] = None
    add_fact: Optional[str] = None
    clear_all_memories: bool = False
