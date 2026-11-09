# -*- coding: utf-8 -*-
"""Fact Schemas for VeriLoom Fact Vault (§Round 3)."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


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


class FactResponseSchema(BaseModel):
    fact_id: str
    tenant: str = "northwind_academy"
    category: str
    subject: str
    predicate: str
    metric: str
    modality: str
    statement: str
    owner: str
    source: str
    provenance_hash: Optional[str] = None
    valid_from: str
    valid_until: str
    status: str = "ACTIVE"


class FactListResponseSchema(BaseModel):
    tenant: str
    reference_review_date: str
    total_facts: int
    active_count: int
    expired_count: int
    facts: List[FactResponseSchema]


class KnowledgeSyncRequestSchema(BaseModel):
    source_name: str = "Confluence Release Notes"
    source_type: str = "confluence"
    document_text: str
    tenant: str = "northwind_academy"
    auto_import_facts: bool = True
