# -*- coding: utf-8 -*-
"""SQLAlchemy models for persistent Copilot conversation history & cross-page memory."""
from sqlalchemy import Column, Integer, String, Text, Boolean
from backend.app.models.database import Base


class ChatMessageModel(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(64), index=True, nullable=False, default="default")
    role = Column(String(16), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False, default="")
    active_tab = Column(String(32), nullable=False, default="workbench")
    actor_name = Column(String(128), nullable=False, default="Nandha K")
    actor_role = Column(String(64), nullable=False, default="Creator")
    reasoning_json = Column(Text, nullable=False, default="[]")
    workflow_links_json = Column(Text, nullable=False, default="[]")
    actions_json = Column(Text, nullable=False, default="[]")
    created_at = Column(String(64), nullable=False)


class ChatMemoryProfileModel(Base):
    __tablename__ = "chat_memory_profiles"

    session_id = Column(String(64), primary_key=True, index=True)
    actor_name = Column(String(128), nullable=False, default="Nandha K")
    preferred_role = Column(String(64), nullable=False, default="Creator")
    last_active_tab = Column(String(32), nullable=False, default="workbench")
    last_asset_id = Column(String(64), nullable=False, default="")
    auto_execute_cua = Column(Boolean, nullable=False, default=True)
    remembered_facts_json = Column(Text, nullable=False, default="[]")
    updated_at = Column(String(64), nullable=False)
