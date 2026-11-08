# -*- coding: utf-8 -*-
"""API Endpoints for the Time-Bounded Fact Vault (§4.5 Improvement 1 & §4.7)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.config import DEFAULT_REVIEW_DATE
from backend.app.models import get_db, FactModel, append_audit_event
from backend.app.schemas.schemas import FactCreateSchema
from backend.app.seed import get_facts_as_dicts

router = APIRouter(prefix="/api/facts", tags=["Fact Vault"])


@router.get("")
def list_facts(tenant: str = "northwind_academy", db: Session = Depends(get_db)):
    facts = get_facts_as_dicts(db, tenant=tenant)
    active_count = sum(1 for f in facts if f["status"] == "ACTIVE")
    expired_count = sum(1 for f in facts if f["status"] == "EXPIRED")
    return {
        "tenant": tenant,
        "reference_review_date": DEFAULT_REVIEW_DATE.isoformat(),
        "total_facts": len(facts),
        "active_count": active_count,
        "expired_count": expired_count,
        "facts": facts,
    }


@router.post("")
def upsert_fact(
    req: FactCreateSchema,
    db: Session = Depends(get_db),
):
    existing = db.query(FactModel).filter(FactModel.fact_id == req.fact_id).first()
    if existing:
        existing.category = req.category
        existing.subject = req.subject
        existing.predicate = req.predicate
        existing.metric = req.metric
        existing.modality = req.modality
        existing.statement = req.statement
        existing.owner = req.owner
        existing.source = req.source
        existing.valid_from = req.valid_from
        existing.valid_until = req.valid_until
    else:
        db.add(
            FactModel(
                fact_id=req.fact_id,
                tenant=req.tenant,
                category=req.category,
                subject=req.subject,
                predicate=req.predicate,
                metric=req.metric,
                modality=req.modality,
                statement=req.statement,
                owner=req.owner,
                source=req.source,
                valid_from=req.valid_from,
                valid_until=req.valid_until,
            )
        )
    db.commit()

    audit = append_audit_event(
        db=db,
        actor_name=req.owner,
        actor_role="Brand Admin",
        event_type="UPSERT_FACT",
        target_id=req.fact_id,
        details={
            "metric": req.metric,
            "modality": req.modality,
            "valid_from": req.valid_from,
            "valid_until": req.valid_until,
        },
    )
    return {"status": "ok", "fact_id": req.fact_id, "audit_block_hash": audit.block_hash}


@router.post("/{fact_id}/toggle-status")
def toggle_fact_status(
    fact_id: str,
    payload: dict = None,
    db: Session = Depends(get_db),
):
    """Allows Brand Admin to expire or reactivate a fact in the Time-Bounded Fact Vault."""
    from fastapi import HTTPException
    actor_role = (payload or {}).get("actor_role", "Brand Admin")
    actor_name = (payload or {}).get("actor_name", "Nandha K")
    if actor_role != "Brand Admin":
        raise HTTPException(
            status_code=403,
            detail="Role lock: Only Brand Admin can expire or reactivate facts in the Fact Vault.",
        )
    fact = db.query(FactModel).filter(FactModel.fact_id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail=f"Fact {fact_id} not found")

    # Reference review date is 2026-10-15; expiring sets valid_until to 2026-06-30, activating sets 2027-12-31
    if fact.valid_until < DEFAULT_REVIEW_DATE.isoformat():
        fact.valid_until = "2027-12-31"
        new_state = "ACTIVE"
    else:
        fact.valid_until = "2026-06-30"
        new_state = "EXPIRED"
    db.commit()

    audit = append_audit_event(
        db=db,
        actor_name=actor_name,
        actor_role=actor_role,
        event_type="TOGGLE_FACT_STATUS",
        target_id=fact_id,
        details={"new_status": new_state, "valid_until": fact.valid_until},
    )
    return {
        "status": "ok",
        "fact_id": fact_id,
        "new_status": new_state,
        "valid_until": fact.valid_until,
        "audit_block_hash": audit.block_hash,
    }
