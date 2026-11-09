# -*- coding: utf-8 -*-
"""API Endpoints for the Time-Bounded Fact Vault (§4.5 Improvement 1 & §4.7)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.config import DEFAULT_REVIEW_DATE
from backend.app.models import get_db, FactModel, append_audit_event
from backend.app.schemas.schemas import FactCreateSchema, KnowledgeSyncRequestSchema
from backend.app.seed import get_facts_as_dicts
from backend.app.engine.knowledge_sync import EnterpriseKnowledgeSyncEngine

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


@router.post("/sync-enterprise")
def sync_enterprise_knowledge(
    req: KnowledgeSyncRequestSchema,
    db: Session = Depends(get_db),
):
    """
    Improvement 1 (§Round 3): Ingests enterprise documentation, extracts atomic facts with
    SHA-256 provenance hashes, updates the Fact Vault, and computes queue blast-radius risk.
    """
    from backend.app.models import AssetModel

    engine = EnterpriseKnowledgeSyncEngine(tenant=req.tenant)
    extracted = engine.extract_atomic_facts_from_document(
        document_text=req.document_text,
        source_title=req.source_name,
        doc_type=req.source_type,
    )

    pending_assets = (
        db.query(AssetModel)
        .filter(AssetModel.tenant == req.tenant)
        .all()
    )
    pending_dicts = [
        {
            "asset_id": a.asset_id,
            "title": a.title,
            "current_content": a.current_content or a.raw_content,
        }
        for a in pending_assets
    ]
    blast_radius = engine.calculate_queue_blast_radius(extracted, pending_dicts)

    imported_count = 0
    if req.auto_import_facts:
        for f in extracted:
            existing = db.query(FactModel).filter(FactModel.fact_id == f["fact_id"]).first()
            if existing:
                existing.category = f["category"]
                existing.subject = f["subject"]
                existing.predicate = f["predicate"]
                existing.metric = f["metric"]
                existing.modality = f["modality"]
                existing.statement = f["statement"]
                existing.owner = f["owner"]
                existing.source = f["source"]
                existing.provenance_hash = f.get("source_sha256") or f.get("provenance_hash", "")
                existing.valid_from = f["valid_from"]
                existing.valid_until = f["valid_until"]
            else:
                db.add(FactModel(
                    fact_id=f["fact_id"],
                    tenant=f["tenant"],
                    category=f["category"],
                    subject=f["subject"],
                    predicate=f["predicate"],
                    metric=f["metric"],
                    modality=f["modality"],
                    statement=f["statement"],
                    owner=f["owner"],
                    source=f["source"],
                    provenance_hash=f.get("source_sha256") or f.get("provenance_hash", ""),
                    valid_from=f["valid_from"],
                    valid_until=f["valid_until"],
                ))
            imported_count += 1
        db.commit()

    audit = append_audit_event(
        db=db,
        actor_name="Brand Knowledge Bot",
        actor_role="System Admin",
        event_type="ENTERPRISE_KNOWLEDGE_SYNC",
        target_id=req.source_name,
        details={
            "source_type": req.source_type,
            "facts_extracted": len(extracted),
            "facts_imported": imported_count,
            "blast_radius_risk": blast_radius.get("blast_radius_risk", "LOW"),
            "impacted_assets_count": blast_radius.get("impacted_assets_count", 0),
        },
    )

    return {
        "status": "ok",
        "source_name": req.source_name,
        "extracted_count": len(extracted),
        "imported_count": imported_count,
        "facts": extracted,
        "blast_radius": blast_radius,
        "audit_block_hash": audit.block_hash,
    }


@router.get("/graph")
def get_facts_graph(tenant: str = "northwind_academy", db: Session = Depends(get_db)):
    """
    Improvement 1 (§Round 3): Returns an interactive graph representation (nodes & edges)
    of all entities and facts for real-time visualization in the Fact Vault.
    """
    facts = get_facts_as_dicts(db, tenant=tenant)
    engine = EnterpriseKnowledgeSyncEngine(tenant=tenant)
    graph = engine.generate_knowledge_graph_representation(facts)
    return {
        "tenant": tenant,
        "total_facts": len(facts),
        **graph,
    }

