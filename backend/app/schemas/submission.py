# -*- coding: utf-8 -*-
"""Submission & Regulatory Schemas for VeriLoom (§Round 3)."""
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class SubmissionCreateSchema(BaseModel):
    """Input schema for asset submission with explicit jurisdiction tracking."""
    title: str
    tenant: str = "northwind_academy"
    content: str
    content_type: str = "text"
    creator_intent: str = ""
    must_keep_points: List[str] = Field(default_factory=list)
    origin: str = "employee"  # employee, agency, ai_generated
    channel: str = "social"   # social, email, web, deck, ad
    jurisdiction: str = "US"  # US, EU, UK, GLOBAL
    review_date: Optional[str] = None
    actor_name: str = "Creator User"
    actor_role: str = "Creator"


class RegulatoryDisclosureApplySchema(BaseModel):
    """Request schema for 1-click legal disclosure injection into an asset."""
    asset_id: str
    rule_id: str
    disclosure_text: str
    placement: str = "append"  # append, prepend, footnote
    actor_name: str = "Creator User"
    actor_role: str = "Creator"


class RegulatoryFindingDetailSchema(BaseModel):
    """Schema for individual regulatory finding recommendations."""
    rule_id: str
    fact_id: str = ""
    jurisdiction: str = "US"
    jurisdiction_name: str = "United States (FTC & Truth in Advertising)"
    source_clause: str
    check_type: str = "regulatory_compliance"
    category: str = "legal_disclosure"
    verdict_tier: str
    severity: str
    high_risk: bool = False
    status: str = "OPEN"
    span: str = "Missing Mandatory Regulatory Disclosure"
    explanation: str
    suggested_disclosure: str = ""
    channel: str = "social"
    channel_char_limit: int = 280
    projected_length: int = 0
    fits_in_channel: bool = True
    suggested_fix: str = ""
    tracked_change: str = ""
    rationale: str = ""
    stability_agreement: float = 1.0
    stability_note: str = ""


class SubmissionResponseSchema(BaseModel):
    """Output schema representing an audited asset, including persistent jurisdiction."""
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
