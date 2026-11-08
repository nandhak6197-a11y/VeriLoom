# -*- coding: utf-8 -*-
"""Review Finding & Suggestion Model."""
from sqlalchemy import Column, Integer, String, Float, Boolean, Text
from backend.app.models.database import Base


class FindingModel(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    finding_id = Column(String(64), unique=True, index=True, nullable=False)
    asset_id = Column(String(64), index=True, nullable=False)
    tenant = Column(String(64), index=True, default="northwind_academy")
    rule_id = Column(String(64), index=True, nullable=False)
    fact_id = Column(String(64), default="")
    source_clause = Column(String(128), nullable=False)
    rule_version = Column(String(32), default="v1.0.0")
    check_type = Column(String(32), nullable=False)     # deterministic, semantic_claim, semantic_tone, visual, accessibility
    category = Column(String(64), default="general")
    verdict_tier = Column(String(32), nullable=False)   # Violation, Advisory, Needs human
    severity = Column(String(32), nullable=False)       # high, medium, low
    high_risk = Column(Boolean, default=False)
    status = Column(String(32), default="OPEN")         # OPEN, ACCEPTED_FIX, DISPUTED, OVERRIDDEN, WAIVED, RESOLVED
    span = Column(Text, default="")
    explanation = Column(Text, nullable=False)
    extracted_claim = Column(Text, default="")
    fact_vault_match = Column(Text, default="")
    stability_note = Column(String(256), default="Deterministic 100% reproducible")
    stability_agreement = Column(Float, default=1.0)
    route_to = Column(String(64), default="Brand Manager")
    suggested_fix = Column(Text, default="")
    tracked_change = Column(Text, default="")
    rationale = Column(Text, default="")
    ipm_score = Column(Float, default=1.0)
    must_keep_preserved = Column(Boolean, default=True)
    intent_lock_note = Column(String(256), default="")
    creator_action = Column(String(64), default="")     # ACCEPT, EDIT, DISPUTE
    creator_comment = Column(Text, default="")
    reviewer_action = Column(String(64), default="")    # CONFIRM, OVERRIDE, WAIVER
    override_reason_code = Column(String(64), default="")
    override_comment = Column(Text, default="")
