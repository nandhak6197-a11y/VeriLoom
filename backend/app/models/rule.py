# -*- coding: utf-8 -*-
"""Deontic Brand-AST Rule Model."""
from sqlalchemy import Column, Integer, String, Boolean, Text
from backend.app.models.database import Base


class RuleModel(Base):
    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(String(64), unique=True, index=True, nullable=False)
    tenant = Column(String(64), index=True, default="northwind_academy")
    version = Column(String(32), default="v1.0.0")
    modality = Column(String(32), nullable=False)  # MUST, FORBIDDEN, CONDITIONAL
    category = Column(String(64), nullable=False)  # terminology, claim, tone, visual, accessibility, formatting, privacy
    check_type = Column(String(32), nullable=False)  # deterministic, semantic
    severity = Column(String(32), nullable=False)  # Violation, Advisory, Needs human
    high_risk = Column(Boolean, default=False)
    source_clause = Column(String(128), nullable=False)
    description = Column(Text, nullable=False)
    patterns_json = Column(Text, default="{}")  # JSON string of forbidden_terms, regex, required_terms, palette, etc.
    examples_json = Column(Text, default="{}")  # JSON string of {"positive": [...], "negative": [...]}
    owner = Column(String(128), default="Brand Admin")
    effective_date = Column(String(32), default="2026-01-01")
    active = Column(Boolean, default=True)
