# -*- coding: utf-8 -*-
"""Submitted Asset & Revision History Model."""
from sqlalchemy import Column, Integer, String, Text
from backend.app.models.database import Base


class AssetModel(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String(64), unique=True, index=True, nullable=False)
    tenant = Column(String(64), index=True, default="northwind_academy")
    title = Column(String(256), nullable=False)
    content_type = Column(String(32), default="text")  # text, markdown, docx, pdf, image
    raw_content = Column(Text, nullable=False)
    normalized_content = Column(Text, nullable=False)
    current_content = Column(Text, nullable=False)
    creator_intent = Column(Text, default="")
    must_keep_points_json = Column(Text, default="[]")
    origin = Column(String(64), default="employee")  # employee, agency, ai_generated
    channel = Column(String(64), default="social")   # social, email, web, deck, ad
    jurisdiction = Column(String(32), default="US")  # US, EU, UK, GLOBAL
    status = Column(String(64), default="SUBMITTED")  # SUBMITTED, NEEDS_CREATOR_RESPONSE, IN_MANAGER_REVIEW, ESCALATED_LEGAL, APPROVED, REJECTED
    assigned_role = Column(String(64), default="Brand Manager")  # Brand Manager or Authorised Reviewer
    overall_verdict = Column(String(64), default="PASS")  # PASS, ADVISORY, NEEDS_HUMAN, VIOLATION
    original_sha256 = Column(String(64), nullable=False)
    normalized_sha256 = Column(String(64), nullable=False)
    approved_sha256 = Column(String(64), default="")
    approved_by = Column(String(128), default="")
    approved_at = Column(String(64), default="")
    rule_set_version = Column(String(32), default="v1.0.0")
    receipt_json = Column(Text, default="{}")
    revisions_json = Column(Text, default="[]")
    created_by_actor = Column(String(128), default="Creator")
    last_modified_by_actor = Column(String(128), default="Creator")
    created_at = Column(String(64), nullable=False)
