# -*- coding: utf-8 -*-
"""Database Seeder for Northwind Academy Brand-AST, Fact Vault & Sample Submissions."""
import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.app.config import DATA_DIR, DEFAULT_REVIEW_DATE
from backend.app.models.rule import RuleModel
from backend.app.models.fact import FactModel
from backend.app.models.asset import AssetModel
from backend.app.models.finding import FindingModel
from backend.app.models.audit_log import append_audit_event
from backend.app.engine.pipeline import run_full_verification_pipeline


def load_json_data(filename: str) -> dict:
    path = DATA_DIR / filename
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_rules_as_dicts(db: Session, tenant: str = "northwind_academy") -> list:
    rows = db.query(RuleModel).filter(RuleModel.tenant == tenant).all()
    out = []
    for r in rows:
        out.append({
            "rule_id": r.rule_id,
            "tenant": r.tenant,
            "version": r.version,
            "modality": r.modality,
            "category": r.category,
            "check_type": r.check_type,
            "severity": r.severity,
            "high_risk": r.high_risk,
            "source_clause": r.source_clause,
            "description": r.description,
            "patterns": json.loads(r.patterns_json or "{}"),
            "examples": json.loads(r.examples_json or "{}"),
            "owner": r.owner,
            "effective_date": r.effective_date,
            "active": r.active,
        })
    return out


def get_facts_as_dicts(db: Session, tenant: str = "northwind_academy") -> list:
    rows = db.query(FactModel).filter(FactModel.tenant == tenant).all()
    out = []
    for f in rows:
        is_valid = f.valid_from <= DEFAULT_REVIEW_DATE.isoformat() <= f.valid_until
        out.append({
            "fact_id": f.fact_id,
            "tenant": f.tenant,
            "category": f.category,
            "subject": f.subject,
            "predicate": f.predicate,
            "metric": f.metric,
            "modality": f.modality,
            "statement": f.statement,
            "owner": f.owner,
            "source": f.source,
            "valid_from": f.valid_from,
            "valid_until": f.valid_until,
            "status": "ACTIVE" if is_valid else "EXPIRED",
        })
    return out


def seed_initial_data(db: Session) -> None:
    """Seeds Northwind Academy Brand-AST rules, Fact Vault, and sample historical assets if DB is empty."""
    if db.query(RuleModel).count() > 0:
        return

    guide_data = load_json_data("northwind_guide.json")
    facts_data = load_json_data("northwind_facts.json")

    for r in guide_data.get("rules", []):
        db.add(
            RuleModel(
                rule_id=r["rule_id"],
                tenant=guide_data.get("tenant", "northwind_academy"),
                version=guide_data.get("version", "v1.0.0"),
                modality=r["modality"],
                category=r["category"],
                check_type=r["check_type"],
                severity=r["severity"],
                high_risk=bool(r.get("high_risk", False)),
                source_clause=r["source_clause"],
                description=r["description"],
                patterns_json=json.dumps(r.get("patterns", {})),
                examples_json=json.dumps(r.get("examples", {})),
                owner=r.get("owner", "Brand Admin"),
                effective_date=r.get("effective_date", "2026-01-01"),
                active=True,
            )
        )

    for f in facts_data.get("facts", []):
        db.add(
            FactModel(
                fact_id=f["fact_id"],
                tenant=facts_data.get("tenant", "northwind_academy"),
                category=f["category"],
                subject=f["subject"],
                predicate=f["predicate"],
                metric=f["metric"],
                modality=f["modality"],
                statement=f["statement"],
                owner=f.get("owner", "Academic Registrar"),
                source=f["source"],
                valid_from=f["valid_from"],
                valid_until=f["valid_until"],
            )
        )

    db.commit()

    append_audit_event(
        db=db,
        actor_name="Nandha K",
        actor_role="Brand Admin",
        event_type="PUBLISH_RULE_SET",
        target_id="northwind_academy:v1.0.0",
        details={
            "rules_compiled": len(guide_data.get("rules", [])),
            "facts_loaded": len(facts_data.get("facts", [])),
            "guide_name": guide_data.get("guide_name"),
        },
        rule_set_version="v1.0.0",
    )

    rules_list = get_rules_as_dicts(db)
    facts_list = get_facts_as_dicts(db)

    # Seed 3 initial submissions (Worked Example §4.4, P13 Expired Fact, P01 Approved Control)
    seed_submissions = [
        {
            "asset_id": "AST-WE-404",
            "title": "§4.4 Worked Example: 12 Nov Onboarding Webinar Promo",
            "content": "Our platform cuts onboarding time by 50%. Join the webinar on 12 Nov.",
            "creator_intent": "Announce the 12 November webinar; convey an onboarding benefit",
            "must_keep_points": ["12 Nov", "webinar"],
            "origin": "ai_generated",
            "channel": "social",
        },
        {
            "asset_id": "AST-P13-EXP",
            "title": "Piece P13 Replay: Data Foundations Enrolment Ad",
            "content": "Data Foundations takes just 12 weeks. Enrol today.",
            "creator_intent": "Promote Data Foundations cohort enrolment",
            "must_keep_points": ["Data Foundations", "Enrol today"],
            "origin": "agency",
            "channel": "ad",
        },
        {
            "asset_id": "AST-P01-CLEAN",
            "title": "Piece P01 Control: Autumn Data Foundations Launch",
            "content": "Start learning data skills this month. Data Foundations gives learners weekly live sessions, recordings and a community forum. Join by 30 November 2026. [Link: Explore Data Foundations]",
            "creator_intent": "Invite learners to join Data Foundations before 30 November 2026",
            "must_keep_points": ["Data Foundations", "30 November 2026"],
            "origin": "employee",
            "channel": "email",
            "auto_approve": True,
        },
    ]

    now_iso = datetime.now(timezone.utc).isoformat()
    for item in seed_submissions:
        res = run_full_verification_pipeline(
            text=item["content"],
            rules=rules_list,
            facts=facts_list,
            must_keep_points=item["must_keep_points"],
            origin=item["origin"],
            channel=item["channel"],
        )
        is_approved = bool(item.get("auto_approve", False))
        status_val = "APPROVED" if is_approved else ("ESCALATED_LEGAL" if res["assigned_role"] == "Authorised Reviewer" else "IN_MANAGER_REVIEW")

        asset = AssetModel(
            asset_id=item["asset_id"],
            tenant="northwind_academy",
            title=item["title"],
            content_type="text",
            raw_content=item["content"],
            normalized_content=res["normalized_content"],
            current_content=res["normalized_content"],
            creator_intent=item["creator_intent"],
            must_keep_points_json=json.dumps(item["must_keep_points"]),
            origin=item["origin"],
            channel=item["channel"],
            status=status_val,
            assigned_role=res["assigned_role"],
            overall_verdict=res["overall_verdict"],
            original_sha256=res["original_sha256"],
            normalized_sha256=res["normalized_sha256"],
            approved_sha256=res["normalized_sha256"] if is_approved else "",
            approved_by="Nandha K (Brand Manager)" if is_approved else "",
            approved_at=now_iso if is_approved else "",
            rule_set_version="v1.0.0",
            receipt_json=json.dumps(res["receipt"]),
            revisions_json=json.dumps([
                {"version": 1, "timestamp": now_iso, "author": "Creator", "content": res["normalized_content"], "sha256": res["normalized_sha256"]}
            ]),
            created_at=now_iso,
        )
        db.add(asset)

        for fnd in res["findings"]:
            db.add(
                FindingModel(
                    finding_id=fnd["finding_id"],
                    asset_id=item["asset_id"],
                    tenant="northwind_academy",
                    rule_id=fnd["rule_id"],
                    fact_id=fnd.get("fact_id", ""),
                    source_clause=fnd["source_clause"],
                    rule_version="v1.0.0",
                    check_type=fnd["check_type"],
                    category=fnd.get("category", "general"),
                    verdict_tier=fnd["verdict_tier"],
                    severity=fnd["severity"],
                    high_risk=fnd["high_risk"],
                    status="OPEN",
                    span=fnd["span"],
                    explanation=fnd["explanation"],
                    extracted_claim=fnd.get("extracted_claim", ""),
                    fact_vault_match=fnd.get("fact_vault_match", ""),
                    stability_note=fnd["stability_note"],
                    stability_agreement=fnd["stability_agreement"],
                    route_to=fnd["route_to"],
                    suggested_fix=fnd["suggested_fix"],
                    tracked_change=fnd["tracked_change"],
                    rationale=fnd.get("rationale", ""),
                    ipm_score=fnd["ipm_score"],
                    must_keep_preserved=fnd["must_keep_preserved"],
                    intent_lock_note=fnd["intent_lock_note"],
                )
            )

        append_audit_event(
            db=db,
            actor_name="Creator",
            actor_role="Creator",
            event_type="SUBMIT_ASSET",
            target_id=item["asset_id"],
            details={
                "title": item["title"],
                "overall_verdict": res["overall_verdict"],
                "findings_count": res["findings_count"],
                "sha256": res["normalized_sha256"],
            },
        )
        if is_approved:
            append_audit_event(
                db=db,
                actor_name="Nandha K",
                actor_role="Brand Manager",
                event_type="APPROVE_ASSET",
                target_id=item["asset_id"],
                details={
                    "approved_sha256": res["normalized_sha256"],
                    "rule_set_version": "v1.0.0",
                },
            )

    # Seed historical resolved/overridden findings to demonstrate ROR Telemetry (§4.6)
    historical_ror_samples = [
        # TERM-01: 4 flags, 0 overrides -> ROR = 0% (<15% -> Creator training gap)
        ("HIST-TERM01-1", "TERM-01", "Terminology §1.1 [TERM-01]", "ACCEPTED_FIX", "CONFIRM", ""),
        ("HIST-TERM01-2", "TERM-01", "Terminology §1.1 [TERM-01]", "ACCEPTED_FIX", "CONFIRM", ""),
        ("HIST-TERM01-3", "TERM-01", "Terminology §1.1 [TERM-01]", "ACCEPTED_FIX", "CONFIRM", ""),
        ("HIST-TERM01-4", "TERM-01", "Terminology §1.1 [TERM-01]", "ACCEPTED_FIX", "CONFIRM", ""),
        # TONE-01: 4 flags, 3 overrides -> ROR = 75% (>45% -> Unclear guideline candidate in creative headlines)
        ("HIST-TONE01-1", "TONE-01", "Brand Voice & Tone §2.1 [TONE-01]", "OVERRIDDEN", "OVERRIDE", "CREATIVE_EXCEPTION"),
        ("HIST-TONE01-2", "TONE-01", "Brand Voice & Tone §2.1 [TONE-01]", "OVERRIDDEN", "OVERRIDE", "UNCLEAR_RULE"),
        ("HIST-TONE01-3", "TONE-01", "Brand Voice & Tone §2.1 [TONE-01]", "OVERRIDDEN", "OVERRIDE", "UNCLEAR_RULE"),
        ("HIST-TONE01-4", "TONE-01", "Brand Voice & Tone §2.1 [TONE-01]", "ACCEPTED_FIX", "CONFIRM", ""),
    ]
    for f_id, r_id, clause, st, rev_act, r_code in historical_ror_samples:
        db.add(
            FindingModel(
                finding_id=f_id,
                asset_id="AST-HIST-ARCHIVE",
                tenant="northwind_academy",
                rule_id=r_id,
                source_clause=clause,
                check_type="deterministic",
                category="terminology" if "TERM" in r_id else "tone",
                verdict_tier="Violation",
                severity="medium",
                high_risk=False,
                status=st,
                span="historical sample",
                explanation=f"Historical telemetry sample for {r_id}",
                reviewer_action=rev_act,
                override_reason_code=r_code,
            )
        )
    db.commit()
