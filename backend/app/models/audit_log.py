# -*- coding: utf-8 -*-
"""Tamper-Evident Append-Only SHA-256 Hash-Chained Audit Log."""
import hashlib
import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import Session
from backend.app.models.database import Base

GENESIS_HASH = "0" * 64


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(String(64), nullable=False)
    actor_name = Column(String(128), nullable=False)
    actor_role = Column(String(64), nullable=False)
    event_type = Column(String(64), nullable=False)
    target_id = Column(String(64), nullable=False)
    rule_set_version = Column(String(32), default="v1.0.0")
    details_json = Column(Text, default="{}")
    prev_hash = Column(String(64), nullable=False)
    block_hash = Column(String(64), unique=True, index=True, nullable=False)


def compute_audit_hash(
    prev_hash: str,
    timestamp: str,
    actor_name: str,
    actor_role: str,
    event_type: str,
    target_id: str,
    rule_set_version: str,
    details_json: str,
) -> str:
    """Computes deterministic SHA-256 hash chaining each audit entry to the previous block."""
    payload = "|".join([
        prev_hash,
        timestamp,
        actor_name,
        actor_role,
        event_type,
        target_id,
        rule_set_version,
        details_json,
    ])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def append_audit_event(
    db: Session,
    actor_name: str,
    actor_role: str,
    event_type: str,
    target_id: str,
    details: dict,
    rule_set_version: str = "v1.0.0",
) -> AuditLogModel:
    """Appends an immutable hash-chained record to the audit log."""
    last_entry = db.query(AuditLogModel).order_by(AuditLogModel.id.desc()).first()
    prev_hash = last_entry.block_hash if last_entry else GENESIS_HASH
    timestamp = datetime.now(timezone.utc).isoformat()
    details_str = json.dumps(details, sort_keys=True)
    block_hash = compute_audit_hash(
        prev_hash=prev_hash,
        timestamp=timestamp,
        actor_name=actor_name,
        actor_role=actor_role,
        event_type=event_type,
        target_id=target_id,
        rule_set_version=rule_set_version,
        details_json=details_str,
    )
    entry = AuditLogModel(
        timestamp=timestamp,
        actor_name=actor_name,
        actor_role=actor_role,
        event_type=event_type,
        target_id=target_id,
        rule_set_version=rule_set_version,
        details_json=details_str,
        prev_hash=prev_hash,
        block_hash=block_hash,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def verify_audit_chain(db: Session) -> dict:
    """Verifies the cryptographic integrity of every event in the append-only audit log."""
    entries = db.query(AuditLogModel).order_by(AuditLogModel.id.asc()).all()
    expected_prev = GENESIS_HASH
    broken_links = []
    for entry in entries:
        recomputed = compute_audit_hash(
            prev_hash=entry.prev_hash,
            timestamp=entry.timestamp,
            actor_name=entry.actor_name,
            actor_role=entry.actor_role,
            event_type=entry.event_type,
            target_id=entry.target_id,
            rule_set_version=entry.rule_set_version,
            details_json=entry.details_json,
        )
        if entry.prev_hash != expected_prev or recomputed != entry.block_hash:
            broken_links.append({
                "id": entry.id,
                "target_id": entry.target_id,
                "expected_prev": expected_prev,
                "actual_prev": entry.prev_hash,
                "expected_hash": recomputed,
                "actual_hash": entry.block_hash,
            })
        expected_prev = entry.block_hash

    return {
        "valid": len(broken_links) == 0,
        "total_events": len(entries),
        "latest_hash": expected_prev,
        "broken_links": broken_links,
    }
