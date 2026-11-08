# -*- coding: utf-8 -*-
"""Fact Vault Time-Bounded Fact Model."""
from sqlalchemy import Column, Integer, String, Text
from backend.app.models.database import Base


class FactModel(Base):
    __tablename__ = "facts"

    id = Column(Integer, primary_key=True, index=True)
    fact_id = Column(String(64), unique=True, index=True, nullable=False)
    tenant = Column(String(64), index=True, default="northwind_academy")
    category = Column(String(64), nullable=False)  # pricing, outcomes, curriculum, onboarding, scholarship
    subject = Column(String(128), nullable=False)
    predicate = Column(String(128), nullable=False)
    metric = Column(String(128), nullable=False)
    modality = Column(String(32), nullable=False)  # Hedged, Conditional, Absolute
    statement = Column(Text, nullable=False)
    owner = Column(String(128), default="Academic Registrar")
    source = Column(String(256), nullable=False)
    valid_from = Column(String(32), nullable=False)   # YYYY-MM-DD
    valid_until = Column(String(32), nullable=False)  # YYYY-MM-DD
