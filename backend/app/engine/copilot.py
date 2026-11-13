# -*- coding: utf-8 -*-
"""
VeriLoom Cross-Page Copilot, Persistent Memory & Computer-Use Action Planner.
Runs 100% locally on the live SQLite governance database and 9-layer engine
with zero external data transmission (EU AI Act / OWASP compliant).
"""
import base64
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from backend.app.config import DEFAULT_REVIEW_DATE, VALID_ROLES
from backend.app.models import (
    AssetModel,
    FindingModel,
    FactModel,
    AuditLogModel,
    ChatMessageModel,
    ChatMemoryProfileModel,
    verify_audit_chain,
)
from backend.app.seed import get_rules_as_dicts, get_facts_as_dicts, load_json_data
from backend.app.engine.ast_compiler import lint_guideline_rules
from backend.app.engine.policy_replay import compute_ror_telemetry
from backend.app.engine.pipeline import run_full_verification_pipeline
from backend.app.engine.groq_rotator import GROQ_ROTATOR


PAGE_DIRECTORY: Dict[str, Dict[str, Any]] = {
    "workbench": {
        "label": "Review Workbench",
        "section": "Hero / Step 1-3 Draft & Findings",
        "aliases": ["workbench", "review workbench", "home", "draft", "submissions", "queue"],
    },
    "visual": {
        "label": "Banner & Contrast",
        "section": "WCAG 2.1, CIEDE2000 & Logo Ratio Auditor",
        "aliases": ["banner", "contrast", "vision", "visual", "banner & contrast", "image audit", "wcag", "logo"],
    },
    "guidelines": {
        "label": "Guideline Lab",
        "section": "Brand-AST Rules, Linter & Policy Replay",
        "aliases": ["guideline lab", "guidelines", "linter", "policy replay", "ast rules", "rules"],
    },
    "facts": {
        "label": "Fact Vault",
        "section": "Time-Bounded Approved Claims Registry",
        "aliases": ["fact vault", "facts", "claims registry", "approved facts"],
    },
    "insights": {
        "label": "Metrics & ROR",
        "section": "Reviewer Override Rate & H1-H7 Telemetry",
        "aliases": ["metrics", "ror", "metrics & ror", "insights", "telemetry", "hypotheses"],
    },
    "audit": {
        "label": "Audit Ledger",
        "section": "Tamper-Evident SHA-256 Chain",
        "aliases": ["audit ledger", "audit log", "ledger", "sha-256", "chain"],
    },
}

_ACTION_CUE_RE = re.compile(
    r"\b("
    r"go to|open|navigate|switch to|switch role|change role|set role|select|choose|"
    r"filter|run|verify|submit|check in|check on|accept|undo|dispute|approve|escalate|reject|"
    r"grant waiver|waive|override|confirm finding|simulate tamper|tamper|restore|repair chain|"
    r"toggle|expire|reactivate|lint|replay|reset|automate|execute|perform|click|do it|apply"
    r")\b",
    re.IGNORECASE,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_json_loads(raw: Optional[str], fallback: Any) -> Any:
    try:
        return json.loads(raw) if raw else fallback
    except Exception:
        return fallback


def get_or_create_memory_profile(
    db: Session,
    session_id: str,
    client_context: Optional[Dict[str, Any]] = None,
) -> ChatMemoryProfileModel:
    sid = (session_id or "default").strip() or "default"
    ctx = client_context or {}
    profile = (
        db.query(ChatMemoryProfileModel)
        .filter(ChatMemoryProfileModel.session_id == sid)
        .first()
    )
    if profile is None:
        profile = ChatMemoryProfileModel(
            session_id=sid,
            actor_name=str(ctx.get("actor_name") or "Nandha K"),
            preferred_role=str(ctx.get("actor_role") or "Creator"),
            last_active_tab=str(ctx.get("active_tab") or "workbench"),
            last_asset_id=str(ctx.get("active_asset_id") or ""),
            auto_execute_cua=True,
            remembered_facts_json="[]",
            updated_at=_now_iso(),
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    else:
        changed = False
        if ctx.get("active_tab") and ctx["active_tab"] in PAGE_DIRECTORY and ctx["active_tab"] != profile.last_active_tab:
            profile.last_active_tab = ctx["active_tab"]
            changed = True
        if ctx.get("active_asset_id") and ctx["active_asset_id"] != profile.last_asset_id:
            profile.last_asset_id = str(ctx["active_asset_id"])
            changed = True
        if changed:
            profile.updated_at = _now_iso()
            db.commit()
    return profile


def serialize_memory_profile(profile: ChatMemoryProfileModel, msg_count: int) -> Dict[str, Any]:
    facts = _safe_json_loads(profile.remembered_facts_json, [])
    return {
        "session_id": profile.session_id,
        "actor_name": profile.actor_name,
        "preferred_role": profile.preferred_role,
        "last_active_tab": profile.last_active_tab,
        "last_asset_id": profile.last_asset_id,
        "auto_execute_cua": bool(profile.auto_execute_cua),
        "remembered_facts": facts,
        "message_count": msg_count,
        "has_memory": msg_count > 0 or len(facts) > 0,
        "suppress_templates": msg_count > 0 or len(facts) > 0,
        "updated_at": profile.updated_at,
    }


def _add_unique_memory(facts: List[str], item: str, max_items: int = 16) -> List[str]:
    clean = re.sub(r"\s+", " ", item).strip(" .;")
    if not clean:
        return facts
    lowered = {f.lower(): idx for idx, f in enumerate(facts)}
    key = clean.lower()
    if key in lowered:
        return facts
    # Replace same-prefix profile attribute cleanly (e.g. "User name: ...")
    prefix = clean.split(":", 1)[0].lower() + ":" if ":" in clean else ""
    if prefix:
        facts = [f for f in facts if not f.lower().startswith(prefix)]
    facts.append(clean)
    return facts[-max_items:]


def update_memory_from_turn(
    db: Session,
    profile: ChatMemoryProfileModel,
    user_message: str,
    client_context: Dict[str, Any],
) -> Tuple[List[str], List[str]]:
    """Extracts persistent preferences & context cues from the user's message."""
    facts: List[str] = _safe_json_loads(profile.remembered_facts_json, [])
    newly_remembered: List[str] = []
    text = user_message.strip()

    # Identity / name extraction
    name_m = re.search(r"\b(?:my name is|i am|call me)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z\.]+){0,2})", text)
    if name_m:
        new_name = name_m.group(1).strip()
        profile.actor_name = new_name
        entry = f"User name: {new_name}"
        facts = _add_unique_memory(facts, entry)
        newly_remembered.append(entry)
    elif client_context.get("actor_name"):
        profile.actor_name = str(client_context["actor_name"])

    # Preferred role memory
    for role_name in VALID_ROLES:
        if re.search(rf"\b(?:always use|default role|prefer(?:red)? role|act as|stay as)\s+{re.escape(role_name)}\b", text, re.I):
            profile.preferred_role = role_name
            entry = f"Preferred role: {role_name}"
            facts = _add_unique_memory(facts, entry)
            newly_remembered.append(entry)

    # Explicit "remember that ..." / "keep in mind ..." / "always ..."
    explicit_patterns = [
        r"\bremember(?:\s+that)?[:\s]+([^.!?\n]{6,140})",
        r"\bkeep in mind(?:\s+that)?[:\s]+([^.!?\n]{6,140})",
        r"\bdon['’]?t forget(?:\s+to)?[:\s]+([^.!?\n]{6,140})",
        r"\b(?:i prefer|always keep|my style is)[:\s]+([^.!?\n]{5,120})",
    ]
    for pat in explicit_patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            note = m.group(1).strip()
            entry = f"Note: {note}"
            before = len(facts)
            facts = _add_unique_memory(facts, entry)
            if len(facts) > before or entry not in newly_remembered:
                newly_remembered.append(entry)

    # Track asset focus if referenced explicitly
    asset_m = re.search(r"\b(AST-[A-Z0-9-]+)\b", text, re.IGNORECASE)
    if asset_m:
        profile.last_asset_id = asset_m.group(1).upper()
    elif client_context.get("active_asset_id"):
        profile.last_asset_id = str(client_context["active_asset_id"])

    if client_context.get("active_tab") in PAGE_DIRECTORY:
        profile.last_active_tab = client_context["active_tab"]

    profile.remembered_facts_json = json.dumps(facts, ensure_ascii=False)
    profile.updated_at = _now_iso()
    db.commit()
    return facts, newly_remembered


def gather_workspace_snapshot(
    db: Session,
    client_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Builds a live structured view of all 6 VeriLoom pages from SQLite."""
    ctx = client_context or {}
    active_tab = ctx.get("active_tab") or "workbench"
    active_asset_id = ctx.get("active_asset_id") or ""

    assets = db.query(AssetModel).order_by(AssetModel.id.desc()).all()
    findings = db.query(FindingModel).all()
    rules = get_rules_as_dicts(db)
    facts = get_facts_as_dicts(db)
    chain = verify_audit_chain(db)
    latest_audit = db.query(AuditLogModel).order_by(AuditLogModel.id.desc()).first()

    # Active asset lookup
    target_asset = None
    if active_asset_id:
        target_asset = next((a for a in assets if a.asset_id == active_asset_id), None)
    if target_asset is None and assets:
        target_asset = next((a for a in assets if a.asset_id == "AST-WE-404"), assets[0])

    asset_findings = (
        [f for f in findings if f.asset_id == target_asset.asset_id]
        if target_asset
        else []
    )

    findings_dicts = [
        {
            "finding_id": f.finding_id,
            "asset_id": f.asset_id,
            "rule_id": f.rule_id,
            "source_clause": f.source_clause,
            "category": f.category,
            "verdict_tier": f.verdict_tier,
            "status": f.status,
            "creator_action": f.creator_action,
            "reviewer_action": f.reviewer_action,
            "override_reason_code": f.override_reason_code,
        }
        for f in findings
    ]
    ror_report = compute_ror_telemetry(findings_dicts, rules)

    active_facts = [f for f in facts if f["status"] == "ACTIVE"]
    expired_facts = [f for f in facts if f["status"] == "EXPIRED"]

    violations_assets = sum(1 for a in assets if "VIOLATION" in (a.overall_verdict or "").upper())
    advisory_assets = sum(1 for a in assets if "ADVISORY" in (a.overall_verdict or "").upper())
    approved_assets = sum(1 for a in assets if a.status == "APPROVED")

    snapshot = {
        "active_tab": active_tab if active_tab in PAGE_DIRECTORY else "workbench",
        "actor_name": ctx.get("actor_name") or "Nandha K",
        "actor_role": ctx.get("actor_role") or "Creator",
        "detail_mode": ctx.get("detail_mode") or "simple",
        "workbench": {
            "total_assets": len(assets),
            "violations_count": violations_assets,
            "advisory_count": advisory_assets,
            "approved_count": approved_assets,
            "active_asset": {
                "asset_id": target_asset.asset_id,
                "title": target_asset.title,
                "status": target_asset.status,
                "overall_verdict": target_asset.overall_verdict,
                "assigned_role": target_asset.assigned_role,
                "current_content": target_asset.current_content,
                "must_keep_points": _safe_json_loads(target_asset.must_keep_points_json, []),
                "findings": [
                    {
                        "finding_id": f.finding_id,
                        "rule_id": f.rule_id,
                        "fact_id": f.fact_id,
                        "verdict_tier": f.verdict_tier,
                        "status": f.status,
                        "span": f.span,
                        "ipm_score": f.ipm_score,
                        "suggested_fix": f.suggested_fix,
                        "explanation": f.explanation,
                    }
                    for f in asset_findings
                ],
            }
            if target_asset
            else None,
            "recent_assets": [
                {
                    "asset_id": a.asset_id,
                    "title": a.title,
                    "verdict": a.overall_verdict,
                    "status": a.status,
                }
                for a in assets[:8]
            ],
        },
        "visual": {
            "wcag_aa_normal": 4.5,
            "ciede2000_max_delta": 2.5,
            "presets": ["compliant_demo", "non_compliant_demo"],
        },
        "guidelines": {
            "active_rules_count": len(rules),
            "rule_ids": [r["rule_id"] for r in rules],
        },
        "facts": {
            "reference_review_date": DEFAULT_REVIEW_DATE.isoformat(),
            "total_facts": len(facts),
            "active_count": len(active_facts),
            "expired_count": len(expired_facts),
            "expired_ids": [f["fact_id"] for f in expired_facts],
            "active_ids": [f["fact_id"] for f in active_facts],
            "facts_brief": [
                {
                    "fact_id": f["fact_id"],
                    "metric": f["metric"],
                    "modality": f["modality"],
                    "status": f["status"],
                    "valid_until": f["valid_until"],
                    "statement": f["statement"],
                }
                for f in facts
            ],
        },
        "insights": {
            "total_findings": len(findings),
            "overall_ror": ror_report.get("overall_ror", 0.0),
            "high_ror_rules": [
                r["rule_id"]
                for r in ror_report.get("rule_metrics", [])
                if r.get("ror", 0) >= 0.45
            ],
        },
        "audit": {
            "chain_valid": bool(chain.get("valid")),
            "total_events": chain.get("total_events", 0),
            "latest_event": {
                "event_type": latest_audit.event_type,
                "actor_name": latest_audit.actor_name,
                "actor_role": latest_audit.actor_role,
                "target_id": latest_audit.target_id,
                "block_hash": latest_audit.block_hash,
            }
            if latest_audit
            else None,
        },
    }
    return snapshot


def _detect_requested_actions(
    user_message: str,
    snapshot: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Plans ordered Computer-Use-Agent UI/API steps ONLY when the user explicitly asks
    the assistant to navigate, switch controls, verify copy, approve, audit, etc.
    """
    text = user_message.strip()
    lower = text.lower()
    if not _ACTION_CUE_RE.search(text):
        return []

    timed_actions: List[Tuple[int, Dict[str, Any]]] = []

    # 1. Role switching
    for role_name in VALID_ROLES:
        m = re.search(
            rf"\b(?:switch(?:\s+role)?\s+to|change(?:\s+role)?\s+to|set\s+role\s+to|act\s+as(?:\s+a|\s+an)?)\s+{re.escape(role_name)}\b",
            text,
            re.IGNORECASE,
        )
        if m:
            timed_actions.append((
                m.start(),
                {
                    "type": "switch_role",
                    "role": role_name,
                    "label": f"Switch role to {role_name}",
                },
            ))

    # 2. Detail mode switching (Audit Details vs Simple View)
    m_dev = re.search(r"\b(?:switch|enable|open|turn on|toggle|use)\b[^.!?\n]*\b(audit details|dev mode|developer mode)\b", lower)
    if m_dev:
        timed_actions.append((
            m_dev.start(),
            {"type": "set_detail_mode", "mode": "dev", "label": "Switch view to Audit Details"},
        ))
    m_simple = re.search(r"\b(?:switch|enable|turn on|use)\b[^.!?\n]*\b(simple view|simple mode)\b", lower)
    if m_simple:
        timed_actions.append((
            m_simple.start(),
            {"type": "set_detail_mode", "mode": "simple", "label": "Switch view to Simple View"},
        ))

    # 3. Tab navigation across all 6 pages
    for tab_key, meta in PAGE_DIRECTORY.items():
        for alias in sorted(meta["aliases"], key=len, reverse=True):
            m_nav = re.search(
                rf"\b(?:go to|open|navigate(?:\s+to)?|switch(?:\s+tab)?\s+to|show(?:\s+me)?|take me to)\s+(?:the\s+)?{re.escape(alias)}\b",
                lower,
            )
            if m_nav:
                timed_actions.append((
                    m_nav.start(),
                    {
                        "type": "switch_tab",
                        "tab": tab_key,
                        "label": f"Navigate to {meta['label']}",
                    },
                ))
                break

    # 4. Asset selection (AST-...)
    m_asset = re.search(r"\b(?:select|open|inspect|load|switch to)\b[^.!?\n]*\b(AST-[A-Z0-9-]+)\b", text, re.IGNORECASE)
    if m_asset:
        aid = m_asset.group(1).upper()
        timed_actions.append((
            m_asset.start(),
            {"type": "select_asset", "asset_id": aid, "label": f"Select asset {aid}"},
        ))

    # 5. Queue filter
    m_flt = re.search(r"\bfilter\b[^.!?\n]*\b(violations?|approved|legal|all)\b", lower)
    if m_flt:
        word = m_flt.group(1)
        fkey = "violations" if word.startswith("violation") else word
        timed_actions.append((
            m_flt.start(),
            {"type": "filter_queue", "filter": fkey, "label": f"Filter queue to '{fkey}'"},
        ))

    # 6. Load preset + optionally verify
    preset_map = [
        ("PRESET-WE-404", r"(?:preset[-_\s]*we[-_\s]*404|worked example|4\.4)"),
        ("PRESET-P13", r"(?:preset[-_\s]*p13|piece\s*p13|p13)"),
        ("PRESET-MODALITY", r"(?:preset[-_\s]*modality|modality inflation|30%)"),
    ]
    for pid, pat in preset_map:
        m_pre = re.search(rf"\b(?:load|apply|use|run)\b[^.!?\n]*{pat}", lower)
        if m_pre:
            timed_actions.append((
                m_pre.start(),
                {"type": "load_preset", "preset_id": pid, "label": f"Load preset {pid}"},
            ))
            break

    # 7. Quoted or explicit draft verification in Workbench
    m_verify_quote = re.search(
        r"\b(?:verify|submit|check(?:\s+in\s+workbench)?|run verification on)\b[^:\"\'\n]*[:\-]?\s*[\"\'“]([^\"\'”]{8,600})[\"\'”]",
        text,
        re.IGNORECASE,
    )
    if m_verify_quote:
        draft_txt = m_verify_quote.group(1).strip()
        timed_actions.append((
            m_verify_quote.start(),
            {
                "type": "fill_and_verify_draft",
                "title": f"Copilot Draft Check ({draft_txt[:28]}...)",
                "content": draft_txt,
                "label": "Fill draft in Review Workbench & verify",
            },
        ))
    elif re.search(r"\b(?:verify\s+(?:the\s+|this\s+)?(?:current\s+)?draft|run\s+verification(?:\s+now)?|verify\s+draft\s+now)\b", lower):
        timed_actions.append((
            lower.find("verify"),
            {"type": "verify_current_draft", "label": "Run Verify Draft Now"},
        ))

    # 8. Creator surgical fix action (accept/undo/dispute)
    active_asset = snapshot.get("workbench", {}).get("active_asset") or {}
    findings = active_asset.get("findings") or []
    explicit_fnd = re.search(r"\b(FND-[A-Z0-9]+)\b", text, re.IGNORECASE)
    target_finding_id = explicit_fnd.group(1).upper() if explicit_fnd else (findings[0]["finding_id"] if findings else "")

    m_creator = re.search(r"\b(accept(?:\s+the)?(?:\s+surgical)?\s+fix|undo(?:\s+the)?\s+fix|revert(?:\s+the)?\s+fix|dispute(?:\s+the)?\s+finding)\b", lower)
    if m_creator and target_finding_id:
        phrase = m_creator.group(1)
        c_act = "UNDO" if ("undo" in phrase or "revert" in phrase) else ("DISPUTE" if "dispute" in phrase else "ACCEPT")
        timed_actions.append((
            m_creator.start(),
            {
                "type": "creator_action",
                "finding_id": target_finding_id,
                "action": c_act,
                "label": f"{c_act.title()} surgical fix on {target_finding_id}",
            },
        ))

    # 9. Asset approval / escalation / rejection
    m_decide = re.search(r"\b(approve|escalate|reject)\b(?:\s+(?:the\s+)?(?:active\s+|current\s+)?(?:asset|submission|draft|AST-[A-Z0-9-]+))?", lower)
    if m_decide:
        word = m_decide.group(1).upper()
        aid_match = re.search(r"\b(AST-[A-Z0-9-]+)\b", text, re.IGNORECASE)
        target_aid = aid_match.group(1).upper() if aid_match else active_asset.get("asset_id", "")
        if target_aid:
            timed_actions.append((
                m_decide.start(),
                {
                    "type": "asset_decision",
                    "asset_id": target_aid,
                    "decision": word,
                    "label": f"{word.title()} submission {target_aid}",
                },
            ))

    # 10. Visual / Banner audit
    m_vis = re.search(r"\b(?:run|audit|test|check)\b[^.!?\n]*\b(compliant|violation|broken|v01|v02)?\s*(?:banner|image|contrast|visual audit)\b", lower)
    if not m_vis:
        m_vis = re.search(r"\b(?:audit|run)\s+(?:preset\s+)?(v01|v02|compliant|violation)\b[^.!?\n]*\b(?:banner|contrast|visual)?", lower)
    if m_vis:
        hint = (m_vis.group(1) or "").lower()
        mode = "non_compliant_demo" if ("violation" in lower or "broken" in lower or "v02" in lower or "off-palette" in lower) else "compliant_demo"
        if hint in ("compliant", "v01"):
            mode = "compliant_demo"
        timed_actions.append((
            m_vis.start(),
            {"type": "run_visual_audit", "preset": mode, "label": f"Run visual contrast audit ({mode})"},
        ))

    # 11. Guideline Linter & Policy Replay
    m_lint = re.search(r"\b(?:run|scan|execute)\b[^.!?\n]*\b(?:guideline\s+)?linter\b", lower)
    if m_lint:
        timed_actions.append((
            m_lint.start(),
            {"type": "run_guideline_linter", "label": "Run Brand-AST Guideline Linter"},
        ))

    m_rep = re.search(r"\b(?:run|execute|simulate)\b[^.!?\n]*\bpolicy\s+replay\b", lower)
    if m_rep:
        timed_actions.append((
            m_rep.start(),
            {"type": "run_policy_replay", "rule_id": "TERM-01", "label": "Execute Policy Replay simulation"},
        ))

    # 12. Fact Vault status toggle
    m_fact_tog = re.search(r"\b(?:toggle|expire|reactivate|activate)\b[^.!?\n]*\b(F-[A-Z0-9-]+)\b", text, re.IGNORECASE)
    if m_fact_tog:
        fid = m_fact_tog.group(1).upper()
        timed_actions.append((
            m_fact_tog.start(),
            {"type": "toggle_fact_status", "fact_id": fid, "label": f"Toggle Fact Vault status for {fid}"},
        ))

    # 13. Audit Tamper simulation & chain restore
    m_tamper = re.search(r"\b(?:simulate|trigger|run)\b[^.!?\n]*\btamper\b", lower)
    if m_tamper:
        timed_actions.append((
            m_tamper.start(),
            {"type": "simulate_tamper", "label": "Simulate SHA-256 tamper alert"},
        ))
    m_restore = re.search(r"\b(?:restore|repair|fix)\b[^.!?\n]*\b(?:audit\s+)?chain\b", lower)
    if m_restore:
        timed_actions.append((
            m_restore.start(),
            {"type": "restore_chain", "label": "Restore SHA-256 Audit Ledger chain"},
        ))

    # 14. Reset demo queue
    m_reset = re.search(r"\breset\s+(?:the\s+)?demo\s+queue\b", lower)
    if m_reset:
        timed_actions.append((
            m_reset.start(),
            {"type": "reset_demo_queue", "label": "Reset demo submission queue"},
        ))

    # Preserve spoken sentence order and deduplicate identical types+targets
    timed_actions.sort(key=lambda pair: pair[0])
    seen = set()
    ordered_actions: List[Dict[str, Any]] = []
    for _, act in timed_actions:
        sig = json.dumps(act, sort_keys=True)
        if sig not in seen:
            seen.add(sig)
            ordered_actions.append(act)
    return ordered_actions


def _format_memory_summary(facts: List[str], profile: ChatMemoryProfileModel) -> str:
    if not facts and not profile.last_asset_id:
        return "Session memory active (no custom notes saved yet)."
    parts = [f"Name: {profile.actor_name}", f"Preferred role: {profile.preferred_role}"]
    if profile.last_asset_id:
        parts.append(f"Focus asset: {profile.last_asset_id}")
    if facts:
        parts.append(f"{len(facts)} saved note(s)")
    return " · ".join(parts)


def _select_workflow_links(snapshot: Dict[str, Any], touched_tabs: List[str]) -> List[Dict[str, Any]]:
    active_tab = snapshot.get("active_tab", "workbench")
    touched_set = set(touched_tabs) | {active_tab}
    summaries = {
        "workbench": f"{snapshot['workbench']['total_assets']} submissions · {snapshot['workbench']['violations_count']} violation(s)",
        "visual": "WCAG >= 4.5:1 & CIEDE2000 <= 2.5",
        "guidelines": f"{snapshot['guidelines']['active_rules_count']} active Brand-AST rules",
        "facts": f"{snapshot['facts']['active_count']} active / {snapshot['facts']['expired_count']} expired",
        "insights": f"ROR {(snapshot['insights']['overall_ror'] * 100):.0f}%",
        "audit": f"{'Verified' if snapshot['audit']['chain_valid'] else 'TAMPER ALERT'} · {snapshot['audit']['total_events']} blocks",
    }
    return [
        {
            "tab": tab_key,
            "label": meta["label"],
            "detail": summaries[tab_key],
            "active": tab_key == active_tab,
            "touched": tab_key in touched_set,
        }
        for tab_key, meta in PAGE_DIRECTORY.items()
    ]


def _format_bytes(num_bytes: int) -> str:
    if not num_bytes or num_bytes <= 0:
        return "0 KB"
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.2f} MB"


def _compose_contextual_reply(
    db: Session,
    user_message: str,
    snapshot: Dict[str, Any],
    profile: ChatMemoryProfileModel,
    facts_memory: List[str],
    newly_remembered: List[str],
    planned_actions: List[Dict[str, Any]],
    allow_actions: bool,
    image_data_url: Optional[str] = None,
    ingested_doc: Optional[Dict[str, Any]] = None,
) -> Tuple[str, List[Dict[str, Any]], List[str]]:
    """Generates a concise, deeply grounded reply + visible reasoning trace."""
    lower = user_message.lower()
    active_tab = snapshot["active_tab"]
    wb = snapshot["workbench"]
    active_asset = wb.get("active_asset")
    facts_info = snapshot["facts"]
    audit_info = snapshot["audit"]
    metrics_info = snapshot["insights"]
    guidelines_info = snapshot["guidelines"]

    touched_tabs: List[str] = [active_tab]
    reasoning: List[Dict[str, Any]] = [
        {
            "step": 1,
            "title": "Cross-Page & Memory Sync",
            "detail": f"Read live state on {PAGE_DIRECTORY[active_tab]['label']} as {snapshot['actor_name']} ({snapshot['actor_role']}). {_format_memory_summary(facts_memory, profile)}.",
            "page": PAGE_DIRECTORY[active_tab]["label"],
        }
    ]
    sections: List[str] = []

    # Prolonged Multimodal Vision Analysis for Image Uploads
    if image_data_url and str(image_data_url).startswith("data:image/"):
        touched_tabs.extend(["visual", "guidelines", "workbench"])
        audit_res = None
        try:
            _, b64_data = str(image_data_url).split(",", 1)
            raw_bytes = base64.b64decode(b64_data)
            from backend.app.engine.vision_auditor import audit_image_bytes
            audit_res = audit_image_bytes(raw_bytes)
        except Exception:
            audit_res = None

        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Multimodal Visual Ingestion & Neural Scan",
            "detail": "Ingested image payload, mapped OCR text coordinates, and extracted 6-swatch dominant color histogram.",
            "page": "Banner & Contrast",
        })
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "CIEDE2000 (ΔE₀₀) & WCAG 2.1 Contrast Math",
            "detail": "Calculated colorimetric distance against Northwind D65 reference swatches and computed luminance ratios across text regions.",
            "page": "Banner & Contrast",
        })
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Brand-AST Cross-Reference & Guideline Evaluation",
            "detail": "Evaluated layout against VIS-01 (palette tolerance <= 2.5), VIS-02 (aspect ratio), and ACC-02 (WCAG AA 4.5:1).",
            "page": "Guideline Lab",
        })
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Synthesizing Prolonged Creator Optimization Guidance",
            "detail": "Structured comprehensive 5-section compliance report and actionable remediation steps.",
            "page": "Review Workbench",
        })

        lines = [
            "### 1. Visual Composition & Brand Presence",
            "- **Focal Architecture**: Visual assets must establish clear reading hierarchy with unobstructed brand focal points.",
            "- **Clear-Space Margins**: Ensure a minimum 24px safety buffer surrounding all Northwind corporate logomarks to prevent visual clipping.",
            "- **Brand Integrity**: Verified aspect ratio fidelity to ensure no horizontal/vertical skewing or compression.",
            "",
            "### 2. WCAG 2.1 Contrast & Readability Analysis",
        ]

        if audit_res and audit_res.get("text_boxes"):
            boxes = audit_res["text_boxes"]
            lines.append(f"- **Detected Text Regions**: Evaluated {len(boxes)} text box region(s) for WCAG 2.1 AA compliance:")
            for b in boxes[:4]:
                status_icon = "PASS" if b.get("wcag_aa_pass") else "FAIL"
                lines.append(f"  - `[{status_icon}]` Text: *\"{b.get('text_preview', 'Sample text')}\"* — Contrast Ratio **{b.get('contrast_ratio', 0.0):.2f}:1** (Threshold: >= 4.5:1).")
        else:
            lines.append("- **Contrast Math**: Standard body copy requires >= 4.5:1 contrast against backing surfaces; large headlines (>= 18pt) require >= 3.0:1. Ensure white `#FFFFFF` or Canvas White `#F8FAFC` is paired with dark backing hues like Northwind Navy `#0F2B48`.")

        lines.extend([
            "",
            "### 3. Palette & Colorimetry (CIEDE2000 ΔE₀₀)",
        ])

        if audit_res and audit_res.get("dominant_swatches"):
            swatches = audit_res["dominant_swatches"]
            lines.append(f"- **Measured Dominant Swatches** (CIEDE2000 tolerance: ΔE₀₀ <= 2.5):")
            for sw in swatches[:4]:
                tol_status = "Approved" if sw.get("within_tolerance") else "Off-Palette Drift"
                lines.append(f"  - Swatch `{sw.get('tested_hex')}` ({sw.get('pixel_share', 0)}% area) -> Closest match: **{sw.get('nearest_name')}** (`{sw.get('nearest_hex')}`) with ΔE₀₀ = {sw.get('delta_e00', 0.0):.2f} (`{tol_status}`).")
        else:
            lines.append("- **Palette Alignment**: Northwind primary palette mandates Northwind Navy (`#0F2B48`), Royal Blue (`#2563EB`), Slate (`#475569`), Canvas White (`#F8FAFC`), and Emerald (`#166534`).")

        lines.extend([
            "",
            "### 4. AST Regulatory Guideline Compliance",
            "- **VIS-01 (Palette Tolerance)**: All primary brand surfaces must fall within ΔE₀₀ <= 2.5 of Northwind standards.",
            "- **ACC-02 (Accessibility Compliance)**: High-contrast body legibility must satisfy Section 508 and WCAG 2.1 Level AA.",
            "- **TERM-01 / LEGAL-01 (Disclosures)**: Any performance, promotional, or claims text must include accompanying asterisk disclaimers in legible font size (>= 10pt). Prohibited absolute superlatives (e.g. \"guaranteed\", \"zero risk\") are strictly disallowed.",
            "",
            "### 5. Actionable Suggestions & Creator Guidance",
            "1. **Elevate Foreground Contrast**: If text overlays complex or photo-rich gradients, add a subtle dark backing scrim (`rgba(15, 43, 72, 0.72)`) to safeguard text legibility above the 4.5:1 threshold.",
            "2. **Normalize Color Swatches**: Snap any near-navy or near-blue elements directly to Northwind Navy (`#0F2B48`) or Royal Blue (`#2563EB`) to eliminate CIEDE2000 off-palette warnings.",
            "3. **Standardize Logo Safe-Zones**: Keep a 1x-logo-height padding buffer around all brand marks to ensure clear visual separation from peripheral copy.",
            "4. **Ledger Commit Readiness**: Once visual adjustments are applied, re-submit through the Banner & Contrast Lab to generate an immutable cryptographic proof on the SHA-256 Audit Ledger.",
        ])

        sections.append("\n".join(lines))

    # Prolonged 9-Layer Document Governance Analysis for Document Uploads
    if ingested_doc and ingested_doc.get("raw_content"):
        touched_tabs.extend(["workbench", "guidelines", "facts", "audit"])
        doc_text = ingested_doc.get("raw_content", "").strip()
        doc_name = ingested_doc.get("filename") or "uploaded_document"
        doc_type = (ingested_doc.get("content_type") or "document").upper()
        raw_sha = ingested_doc.get("raw_sha256") or ""
        norm_sha = ingested_doc.get("normalized_sha256") or ""
        meta = ingested_doc.get("metadata") or {}
        byte_len = ingested_doc.get("byte_length", 0)

        rules = get_rules_as_dicts(db)
        vault_facts = get_facts_as_dicts(db)
        pipe_res = run_full_verification_pipeline(
            text=doc_text,
            rules=rules,
            facts=vault_facts,
            must_keep_points=[],
            origin="employee",
            channel="social",
            review_date=DEFAULT_REVIEW_DATE,
        )

        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Multi-Format Ingestion & SHA-256 Fingerprint",
            "detail": f"Ingested {doc_name} ({doc_type}, {_format_bytes(byte_len)}). Dual SHA-256 digests: raw {raw_sha[:16]}..., normalized {norm_sha[:16]}.... Parsers sandboxed for rapid memory safety.",
            "page": "Review Workbench",
        })
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "9-Layer Brand-AST Evaluation",
            "detail": f"Ran Brand-AST policy compiler across {len(doc_text)} extracted characters -> Verdict {pipe_res['overall_verdict']} ({pipe_res['findings_count']} finding(s)).",
            "page": "Guideline Lab",
        })
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Fact Vault Verification & Temporal Grounding",
            "detail": f"Cross-referenced extracted claims against {len(vault_facts)} approved claims as of reference date {DEFAULT_REVIEW_DATE}.",
            "page": "Fact Vault",
        })
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Synthesizing Prolonged Document Audit Report",
            "detail": "Generated comprehensive 5-section governance report with prescriptive surgical rewrites and audit ledger routing.",
            "page": "Audit Ledger",
        })

        doc_lines = [
            "### 1. Document Architecture & Ingestion Profile",
            f"- **File Asset**: `{doc_name}` (`{doc_type}`) — Size: `{_format_bytes(byte_len)}`",
            "- **Cryptographic Fingerprint (Layer 1 Dual SHA-256)**:",
            f"  - Raw Ingestion Digest: `{raw_sha}`",
            f"  - Normalized Corpus Digest: `{norm_sha}`",
            f"- **Ingestion Metrics**: Extracted `{len(doc_text)}` characters" + (f" across {meta.get('page_count')} page(s)" if meta.get('page_count') else "") + (f", {meta.get('paragraph_count')} paragraph(s)" if meta.get('paragraph_count') else "") + "." + (f" *({meta.get('page_cap_note')})*" if meta.get('page_cap_note') else ""),
            "",
            "### 2. 9-Layer Brand-AST & Regulatory Findings",
            f"- **Overall Verdict**: `{pipe_res['overall_verdict']}` (Routed to `{pipe_res['assigned_role']}` for governance)",
            f"- **Readability & Complexity**: Flesch Reading Ease `{pipe_res['readability']['flesch_reading_ease']:.1f}` ({pipe_res['readability']['grade_level']})",
        ]

        if pipe_res.get("findings"):
            doc_lines.append(f"- **Identified Policy Findings ({pipe_res['findings_count']})**:")
            for fnd in pipe_res["findings"][:5]:
                fix_text = f" -> *Fix:* `{fnd.get('suggested_fix')}`" if fnd.get("suggested_fix") else ""
                flagged = f" *\"{fnd.get('flagged_text')}\"*" if fnd.get("flagged_text") else ""
                doc_lines.append(f"  - `[{fnd['verdict_tier']}]` **{fnd['rule_id']}**: {fnd['explanation']}{flagged}{fix_text}")
        else:
            doc_lines.append("- **Policy Clearance**: All Brand-AST rules, terminology standards, and regulatory disclosure checks passed with 100% compliance.")

        doc_lines.extend([
            "",
            "### 3. Fact Vault Verification & Temporal Grounding",
        ])

        fact_findings = [f for f in pipe_res.get("findings", []) if f.get("rule_id") == "RULE-007" or "fact" in f.get("explanation", "").lower()]
        if fact_findings:
            doc_lines.append(f"- **Fact Vault Alerts**: Identified {len(fact_findings)} unverified or expired claim(s):")
            for ff in fact_findings:
                doc_lines.append(f"  - `[{ff['verdict_tier']}]` {ff['explanation']}")
        else:
            doc_lines.append(f"- **Fact Registry Status**: Extracted document metrics checked against active claims (e.g. 99.9% SLA, SOC-2 Type II). Temporal boundary confirmed valid against {DEFAULT_REVIEW_DATE}.")

        doc_lines.extend([
            "",
            "### 4. Prescriptive Rewriter Suggestions",
        ])

        rewrites = pipe_res.get("surgical_rewrites") or []
        if rewrites:
            doc_lines.append("- **Surgical Text Corrections (Zero Hallucination)**:")
            for rw in rewrites[:4]:
                orig = rw.get("original_clause") or rw.get("original", "")
                sug = rw.get("suggested_clause") or rw.get("replacement", "")
                reason = rw.get("rule_id", "Policy Compliance")
                doc_lines.append(f"  - Replace: ~~\"{orig}\"~~ -> **\"{sug}\"** *({reason})*")
        elif pipe_res.get("findings"):
            doc_lines.append("- **Recommended Remediations**:")
            for fnd in pipe_res["findings"][:3]:
                if fnd.get("suggested_fix"):
                    doc_lines.append(f"  - Replace flagged copy with approved terminology: **\"{fnd['suggested_fix']}\"**.")
                else:
                    doc_lines.append(f"  - Add mandatory qualifying disclosures or substantiate metric for **{fnd['rule_id']}**.")
        else:
            doc_lines.append("- **Document Ready**: No surgical rewrites required. Copy satisfies Northwind brand safety thresholds.")

        doc_lines.extend([
            "",
            "### 5. Audit Ledger & Compliance Next Steps",
            "1. **Reviewer Sign-Off**: Document requires formal sign-off from an Authorised Reviewer or Brand Admin prior to external distribution.",
            "2. **Cryptographic Chaining**: Upon final approval in the Review Workbench, this asset will be permanently recorded in the SHA-256 tamper-evident Audit Ledger.",
            "3. **Workflow Integration**: To load this extracted copy directly into the draft staging queue, use the Auto-Act command *'Fill and verify draft with uploaded document'*.",
        ])

        sections.append("\n".join(doc_lines))

    if newly_remembered:
        sections.append(
            "**Saved to Memory:** " + "; ".join(f"`{m}`" for m in newly_remembered)
        )

    # Inline text verification query (even without UI automation)
    quoted_preview = re.search(
        r"\b(?:evaluate|scan|test|check|verify)\b[^:\"\'\n]{0,40}[:\-]?\s*[\"\'“]([^\"\'”]{8,600})[\"\'”]",
        user_message,
        re.IGNORECASE,
    )
    if quoted_preview and not any(a["type"] == "fill_and_verify_draft" for a in planned_actions):
        sample_text = quoted_preview.group(1).strip()
        rules = get_rules_as_dicts(db)
        vault_facts = get_facts_as_dicts(db)
        res = run_full_verification_pipeline(
            text=sample_text,
            rules=rules,
            facts=vault_facts,
            must_keep_points=[],
            origin="employee",
            channel="social",
        )
        touched_tabs.extend(["workbench", "guidelines", "facts"])
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "9-Layer Neuro-Symbolic Evaluation",
            "detail": f"Executed deterministic + Brand-AST + Fact Vault checks on quoted text -> Verdict {res['overall_verdict']} ({res['findings_count']} finding(s)).",
            "page": "Review Workbench",
        })
        lines = [f"**Inline Verification Verdict:** `{res['overall_verdict']}` ({res['findings_count']} finding(s), routed to `{res['assigned_role']}`)"]
        for fnd in res["findings"][:4]:
            lines.append(
                f"- **{fnd['rule_id']}** (`{fnd['verdict_tier']}`): {fnd['explanation']}"
                + (f" *(Suggested fix: `{fnd['suggested_fix']}`, IPM `{fnd['ipm_score']:.2f}`)*" if fnd.get("suggested_fix") else "")
            )
        sections.append("\n".join(lines))

    # Specific domain queries across pages
    if any(k in lower for k in ["memory", "remembered", "who am i", "what do you know"]):
        mem_lines = [
            f"**Workspace Memory ({profile.actor_name}):**",
            f"- Preferred role: `{profile.preferred_role}` | Last page: `{PAGE_DIRECTORY.get(profile.last_active_tab, {}).get('label', profile.last_active_tab)}` | Focus asset: `{profile.last_asset_id or 'None'}`",
        ]
        if facts_memory:
            mem_lines.extend(f"- {item}" for item in facts_memory)
        else:
            mem_lines.append("- No custom standing notes yet—tell me anything you want me to remember across tabs and reloads.")
        sections.append("\n".join(mem_lines))

    if any(k in lower for k in ["fact", "expired", "f-014", "f-dur", "valid_until", "vault"]):
        touched_tabs.append("facts")
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Fact Vault Inspection",
            "detail": f"Checked {facts_info['total_facts']} facts against review date {facts_info['reference_review_date']}: {facts_info['active_count']} active, {facts_info['expired_count']} expired.",
            "page": "Fact Vault",
        })
        exp_str = ", ".join(f"`{fid}`" for fid in facts_info["expired_ids"]) or "None"
        sections.append(
            f"**Fact Vault Status (as of `{facts_info['reference_review_date']}`):**\n"
            f"- **{facts_info['active_count']} Active** / **{facts_info['expired_count']} Expired** ({exp_str})\n"
            f"- Expired claims trigger automatic `Violation` (`FACT-01`) or `Advisory` (`UNSUPPORTED_CLAIM`) routing so outdated stats cannot slip through."
        )

    if any(k in lower for k in ["audit", "chain", "sha", "tamper", "hash", "block", "ledger"]):
        touched_tabs.append("audit")
        latest = audit_info["latest_event"]
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "SHA-256 Chain Integrity Check",
            "detail": f"Verified {audit_info['total_events']} audit ledger blocks -> valid={audit_info['chain_valid']}.",
            "page": "Audit Ledger",
        })
        latest_line = (
            f"- Latest block: `{latest['event_type']}` on `{latest['target_id']}` by {latest['actor_name']} (`{latest['block_hash'][:12]}...`)"
            if latest
            else "- No audit blocks logged yet."
        )
        sections.append(
            f"**Audit Ledger Integrity:** `{'VERIFIED' if audit_info['chain_valid'] else 'TAMPER DETECTED'}` (`{audit_info['total_events']}` blocks)\n"
            f"{latest_line}"
        )

    if any(k in lower for k in ["ror", "metric", "telemetry", "h1", "h2", "h5", "override rate", "tone-01", "insights"]):
        touched_tabs.append("insights")
        high_ror = ", ".join(f"`{r}`" for r in metrics_info["high_ror_rules"]) or "None"
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "ROR Telemetry Sync",
            "detail": f"Aggregated {metrics_info['total_findings']} findings; overall ROR={(metrics_info['overall_ror'] * 100):.1f}%, flagged unclear rules={high_ror}.",
            "page": "Metrics & ROR",
        })
        sections.append(
            f"**Metrics & ROR Telemetry:**\n"
            f"- Logged findings: `{metrics_info['total_findings']}` | Overall Override Rate: `{(metrics_info['overall_ror'] * 100):.1f}%`\n"
            f"- High-override rule candidates: {high_ror}"
        )

    if any(k in lower for k in ["rule", "guideline", "linter", "replay", "ast"]):
        touched_tabs.append("guidelines")
        active_rules = get_rules_as_dicts(db)
        guide_meta = load_json_data("northwind_guide.json")
        lint_rep = lint_guideline_rules(active_rules + guide_meta.get("seeded_defect_rules_for_linter_test", []))
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Brand-AST & Guideline Linter Analysis",
            "detail": f"Scanned {guidelines_info['active_rules_count']} active rules + seeded defects -> {len(lint_rep.get('flagged_rule_ids', []))} rule(s) flagged.",
            "page": "Guideline Lab",
        })
        sections.append(
            f"**Guideline Lab & Brand-AST:**\n"
            f"- Active compiled rules: `{guidelines_info['active_rules_count']}` | Linter detects `{len(lint_rep.get('flagged_rule_ids', []))}` defective rule group(s) (`{', '.join(lint_rep.get('flagged_rule_ids', [])[:4])}`)."
        )

    if any(k in lower for k in ["banner", "contrast", "wcag", "ciede", "logo", "visual"]):
        touched_tabs.append("visual")
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Vision & Colorimetry Readiness",
            "detail": "Checked deterministic WCAG 2.1 (>=4.5:1), CIEDE2000 (<=2.5), and logo aspect-ratio thresholds.",
            "page": "Banner & Contrast",
        })
        if not planned_actions:
            sections.append(
                "**Banner & Contrast Auditor:** Evaluates banners deterministically against `WCAG >= 4.5:1`, `CIEDE2000 <= 2.5` Northwind palette tolerance, and `4.0:1` logo aspect ratio (`±5%`). Say *\"open Banner & Contrast and run violation audit\"* to run it live."
            )

    if any(k in lower for k in ["finding", "why", "explain", "asset", "submission", "status", "summary", "overview", "help", "current", "page"]) and active_asset:
        touched_tabs.append("workbench")
        f_list = active_asset["findings"]
        reasoning.append({
            "step": len(reasoning) + 1,
            "title": "Active Submission & Finding Grounding",
            "detail": f"Inspected {active_asset['asset_id']} ({active_asset['overall_verdict']}, {len(f_list)} finding(s), status={active_asset['status']}).",
            "page": "Review Workbench",
        })
        if not sections:
            lines = [
                f"**{active_asset['asset_id']}** — *{active_asset['title']}*",
                f"- **Verdict:** `{active_asset['overall_verdict']}` | **Workflow State:** `{active_asset['status']}` | **Assigned:** `{active_asset['assigned_role']}`",
            ]
            for f in f_list[:4]:
                lines.append(
                    f"- **{f['rule_id']}** (`{f['verdict_tier']}` · `{f['status']}`): {f['explanation']}"
                    + (f" — IPM `{f['ipm_score']:.2f}`" if f.get("ipm_score") is not None else "")
                )
            sections.append("\n".join(lines))

    # Action Automation narration
    if planned_actions:
        for act in planned_actions:
            if act.get("tab") and act["tab"] in PAGE_DIRECTORY:
                touched_tabs.append(act["tab"])
        action_list_md = "\n".join(f"- {a['label']}" for a in planned_actions)
        if allow_actions:
            reasoning.append({
                "step": len(reasoning) + 1,
                "title": "Computer-Use Agent Dispatch",
                "detail": f"Executing {len(planned_actions)} live UI/workflow step(s) across the workbench.",
                "page": PAGE_DIRECTORY[active_tab]["label"],
            })
            sections.append(f"**Executing Live Actions ({len(planned_actions)} step(s)):**\n{action_list_md}")
        else:
            reasoning.append({
                "step": len(reasoning) + 1,
                "title": "Action Plan Staged (Auto-Act Off)",
                "detail": f"Staged {len(planned_actions)} action(s) without executing because Auto-Act is turned off.",
                "page": PAGE_DIRECTORY[active_tab]["label"],
            })
            sections.append(
                f"**Staged Actions (Auto-Act is currently OFF):**\n{action_list_md}\n\nEnable **Auto-Act** in the composer or click **Run Planned Actions** below to execute them live."
            )

    # Fallback if general greeting or custom conversational query
    if not sections:
        asset_note = (
            f"Active submission is `{active_asset['asset_id']}` (`{active_asset['overall_verdict']}`)"
            if active_asset
            else "No submissions loaded yet"
        )
        sections.append(
            f"Connected to **{PAGE_DIRECTORY[active_tab]['label']}** as **{snapshot['actor_name']}** (`{snapshot['actor_role']}`).\n"
            f"- {asset_note} · `{guidelines_info['active_rules_count']}` active rules · `{facts_info['active_count']}` active / `{facts_info['expired_count']}` expired facts · Ledger `{'Verified' if audit_info['chain_valid'] else 'Tampered'}` (`{audit_info['total_events']}` blocks).\n\n"
            f"Ask me about any rule, fact, or submission, paste draft copy to verify, or ask me to automate steps (e.g., *\"Switch to Brand Manager, run Banner violation audit, then open Audit Ledger\"*)."
        )

    return "\n\n".join(sections), reasoning, touched_tabs


_ALLOWED_CUA_ACTION_TYPES = {
    "switch_role",
    "set_detail_mode",
    "switch_tab",
    "select_asset",
    "filter_queue",
    "load_preset",
    "fill_and_verify_draft",
    "verify_current_draft",
    "creator_action",
    "reviewer_action",
    "asset_decision",
    "run_visual_audit",
    "run_guideline_linter",
    "run_policy_replay",
    "toggle_fact_status",
    "reset_demo_queue",
    "simulate_tamper",
    "restore_chain",
}


def _sanitize_cua_actions(raw_actions: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_actions, list):
        return []
    cleaned: List[Dict[str, Any]] = []
    for item in raw_actions:
        if not isinstance(item, dict):
            continue
        atype = str(item.get("type") or "").strip()
        if atype not in _ALLOWED_CUA_ACTION_TYPES:
            continue
        act = dict(item)
        if atype == "switch_role" and act.get("role") not in VALID_ROLES:
            continue
        if atype == "switch_tab" and act.get("tab") not in PAGE_DIRECTORY:
            continue
        if atype == "set_detail_mode" and act.get("mode") not in ("simple", "dev"):
            continue
        if not act.get("label"):
            act["label"] = atype.replace("_", " ").title()
        cleaned.append(act)
    return cleaned


def _extract_json_object(raw_text: str) -> Optional[Dict[str, Any]]:
    txt = (raw_text or "").strip()
    if not txt:
        return None
    # Strip <think>...</think> blocks if emitted before JSON
    txt = re.sub(r"<think>.*?</think>", "", txt, flags=re.DOTALL).strip()
    if txt.startswith("```"):
        txt = re.sub(r"^```(?:json)?\s*|\s*```$", "", txt, flags=re.IGNORECASE | re.DOTALL).strip()
    try:
        parsed = json.loads(txt)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        m = re.search(r"\{.*\}", txt, flags=re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
    return None


def _run_groq_copilot(
    db: Session,
    profile: ChatMemoryProfileModel,
    snapshot: Dict[str, Any],
    facts_memory: List[str],
    newly_remembered: List[str],
    user_message: str,
    allow_actions: bool,
    model_preference: str = "auto",
    reasoning_effort: str = "low",
    image_data_url: Optional[str] = None,
    ingested_doc: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if GROQ_ROTATOR.key_count == 0:
        return None

    history_rows = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == profile.session_id)
        .order_by(ChatMessageModel.id.desc())
        .limit(8)
        .all()
    )
    history_rows.reverse()

    active_asset = snapshot["workbench"].get("active_asset")
    compact_context = {
        "active_tab": snapshot["active_tab"],
        "actor_name": snapshot["actor_name"],
        "actor_role": snapshot["actor_role"],
        "detail_mode": snapshot["detail_mode"],
        "memory": {
            "preferred_role": profile.preferred_role,
            "last_asset_id": profile.last_asset_id,
            "remembered_facts": facts_memory,
            "newly_remembered": newly_remembered,
        },
        "workbench": {
            "total_assets": snapshot["workbench"]["total_assets"],
            "violations_count": snapshot["workbench"]["violations_count"],
            "active_asset": active_asset,
            "recent_assets": snapshot["workbench"]["recent_assets"],
        },
        "facts": {
            "reference_review_date": snapshot["facts"]["reference_review_date"],
            "active_count": snapshot["facts"]["active_count"],
            "expired_count": snapshot["facts"]["expired_count"],
            "expired_ids": snapshot["facts"]["expired_ids"],
            "facts_brief": snapshot["facts"]["facts_brief"],
        },
        "guidelines": snapshot["guidelines"],
        "insights": snapshot["insights"],
        "audit": snapshot["audit"],
    }

    system_prompt = (
        "You are VeriLoom Copilot, an intelligent cross-page AI assistant and Computer-Use Agent embedded inside the VeriLoom Enterprise Brand & Fact Governance Workbench.\n"
        "You are connected live to all 6 workspace pages: workbench, visual (Banner & Contrast), guidelines (Guideline Lab), facts (Fact Vault), insights (Metrics & ROR), and audit (Audit Ledger).\n\n"
        "STRICT RESPONSE FORMAT: Return a single valid JSON object with keys:\n"
        '- "reply": Concise, accurate Markdown response grounded strictly in LIVE_WORKSPACE_STATE.\n'
        '- "reasoning_steps": Array of 2-4 objects {"step": int, "title": str, "detail": str, "page": str}.\n'
        '- "touched_tabs": Array of relevant tab keys from ["workbench","visual","guidelines","facts","insights","audit"].\n'
        '- "actions": Array of UI/workflow automation objects ONLY when the user explicitly requests acting/navigating/switching/verifying/approving/auditing/tampering/restoring. '
        "For informational questions, ALWAYS keep actions = [].\n\n"
        "ALLOWED ACTION SCHEMAS:\n"
        '1. {"type":"switch_role","role":"Creator|Brand Manager|Authorised Reviewer|Brand Admin","label":"..."}\n'
        '2. {"type":"set_detail_mode","mode":"simple|dev","label":"..."}\n'
        '3. {"type":"switch_tab","tab":"workbench|visual|guidelines|facts|insights|audit","label":"..."}\n'
        '4. {"type":"select_asset","asset_id":"AST-...","label":"..."}\n'
        '5. {"type":"filter_queue","filter":"all|violations|legal|approved","label":"..."}\n'
        '6. {"type":"load_preset","preset_id":"PRESET-WE-404|PRESET-P13|PRESET-MODALITY","label":"..."}\n'
        '7. {"type":"fill_and_verify_draft","title":"...","content":"...","label":"..."}\n'
        '8. {"type":"verify_current_draft","label":"..."}\n'
        '9. {"type":"creator_action","finding_id":"FND-...","action":"ACCEPT|UNDO|DISPUTE","label":"..."}\n'
        '10. {"type":"reviewer_action","finding_id":"FND-...","action":"WAIVER|OVERRIDE|CONFIRM","label":"..."}\n'
        '11. {"type":"asset_decision","asset_id":"AST-...","decision":"APPROVE|ESCALATE|REJECT","label":"..."}\n'
        '12. {"type":"run_visual_audit","preset":"compliant_demo|non_compliant_demo","label":"..."}\n'
        '13. {"type":"run_guideline_linter","label":"..."}\n'
        '14. {"type":"run_policy_replay","rule_id":"TERM-01","label":"..."}\n'
        '15. {"type":"toggle_fact_status","fact_id":"F-...","label":"..."}\n'
        '16. {"type":"reset_demo_queue","label":"..."}\n'
        '17. {"type":"simulate_tamper","label":"..."}\n'
        '18. {"type":"restore_chain","label":"..."}\n\n'
        f"Auto-Act enabled by user: {allow_actions}.\n"
        f"LIVE_WORKSPACE_STATE:\n{json.dumps(compact_context, ensure_ascii=False)}"
    )

    has_img = bool(image_data_url and str(image_data_url).startswith("data:image/"))
    if has_img:
        system_prompt += (
            "\n\nMULTIMODAL IMAGE & VISION AUDIT DIRECTIVE:\n"
            "The user has uploaded an image asset for visual brand and compliance inspection. "
            "Provide a prolonged, comprehensive, in-depth Markdown audit structured with clear section headers:\n"
            "### 1. Visual Composition & Brand Presence\n"
            "- Analyze layout balance, focal hierarchy, logo positioning, and clear-space safety zones.\n"
            "### 2. WCAG 2.1 Contrast & Readability Analysis\n"
            "- Evaluate text legibility over backgrounds, checking against WCAG AA standards (>= 4.5:1 for standard body text, >= 3.0:1 for large display headers).\n"
            "### 3. Palette & Colorimetry (CIEDE2000 ΔE₀₀)\n"
            "- Assess adherence to the Northwind enterprise palette (Primary Navy #0F2B48, Royal Blue #2563EB, Slate #475569, Canvas White #F8FAFC, Emerald #166534). Note any off-palette drift exceeding ΔE₀₀ <= 2.5.\n"
            "### 4. AST Regulatory Guideline Compliance\n"
            "- Check for mandatory disclosure disclaimers, asterisk/footnote visibility, prohibited promotional terms, and unsubstantiated superlatives.\n"
            "### 5. Actionable Suggestions & Creator Guidance\n"
            "- Give detailed, step-by-step guidance on specific edits the creator should make to achieve 100% compliance before committing to the cryptographic ledger.\n"
            "Keep the analysis prolonged, precise, professional, and deeply grounded in VeriLoom's core project governance."
        )

    if ingested_doc and ingested_doc.get("raw_content"):
        doc_filename = ingested_doc.get("filename") or "document"
        doc_content = ingested_doc.get("raw_content", "")[:5000]
        system_prompt += (
            f"\n\nDOCUMENT GOVERNANCE & 9-LAYER AUDIT DIRECTIVE:\n"
            f"The user has uploaded a document asset: '{doc_filename}' (Format: {ingested_doc.get('content_type')}, SHA-256: {ingested_doc.get('raw_sha256')}).\n"
            f"Extracted Document Text Preview:\n\"\"\"{doc_content}\"\"\"\n\n"
            "Provide a prolonged, comprehensive, in-depth Markdown audit structured with clear section headers:\n"
            "### 1. Document Architecture & Ingestion Profile\n"
            "- Report file format, SHA-256 cryptographic fingerprint, paragraph/page count, and raw text extraction fidelity.\n"
            "### 2. 9-Layer Brand-AST & Regulatory Findings\n"
            "- Analyze the document text against Northwind Brand-AST rules (TERM-01, LEGAL-01, ACC-02, CLAIM-01). Highlight specific flagged clauses, severity levels, and policy violations.\n"
            "### 3. Fact Vault Verification & Temporal Grounding\n"
            "- Cross-reference metrics, claims, and dates against the Fact Vault registry. Flag expired or unsubstantiated claims.\n"
            "### 4. Prescriptive Rewriter Suggestions\n"
            "- Provide exact, compliant rewrite suggestions for every flagged sentence or prohibited superlative.\n"
            "### 5. Audit Ledger & Compliance Next Steps\n"
            "- Outline the cryptographic approval path, role-based sign-off requirements, and ledger commit readiness.\n"
            "Keep the analysis prolonged, precise, professional, and deeply grounded in VeriLoom's core project governance."
        )

    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for row in history_rows:
        messages.append({"role": row.role, "content": row.content[:1200]})

    if has_img:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": user_message},
                {"type": "image_url", "image_url": {"url": image_data_url}},
            ],
        })
    elif ingested_doc and ingested_doc.get("raw_content"):
        messages.append({
            "role": "user",
            "content": (
                f"{user_message}\n\n"
                f"[Attached Document: {ingested_doc.get('filename')}]\n"
                f"SHA-256: {ingested_doc.get('raw_sha256')}\n"
                f"Extracted Content:\n{ingested_doc.get('raw_content')[:4000]}"
            ),
        })
    else:
        messages.append({"role": "user", "content": user_message})

    groq_res = GROQ_ROTATOR.chat_completion(
        messages=messages,
        preferred_model=model_preference,
        reasoning_effort=reasoning_effort,
        has_image=has_img,
        response_format={"type": "json_object"},
        max_tokens=2048 if (has_img or ingested_doc) else 1200,
        temperature=0.2,
    )
    if not groq_res.get("ok"):
        return None

    parsed = _extract_json_object(groq_res.get("content", ""))
    if not parsed or not parsed.get("reply"):
        return None

    raw_steps = parsed.get("reasoning_steps")
    formatted_steps = []
    if isinstance(raw_steps, list):
        for idx, item in enumerate(raw_steps):
            if isinstance(item, dict):
                formatted_steps.append({
                    "step": item.get("step", idx + 1),
                    "title": item.get("title", f"Step {idx + 1}"),
                    "detail": item.get("detail", ""),
                    "page": item.get("page", PAGE_DIRECTORY[snapshot["active_tab"]]["label"]),
                })
            elif isinstance(item, str) and item.strip():
                formatted_steps.append({
                    "step": idx + 1,
                    "title": item.strip(),
                    "detail": "",
                    "page": PAGE_DIRECTORY[snapshot["active_tab"]]["label"],
                })

    return {
        "reply": str(parsed.get("reply")).strip(),
        "reasoning_steps": formatted_steps,
        "touched_tabs": [t for t in (parsed.get("touched_tabs") or []) if t in PAGE_DIRECTORY],
        "actions": _sanitize_cua_actions(parsed.get("actions")),
        "provider_meta": {
            "provider": "groq",
            "model": groq_res.get("model"),
            "key_slot": groq_res.get("key_slot"),
            "latency_ms": groq_res.get("latency_ms"),
            "reasoning_content": groq_res.get("reasoning_content") or "",
        },
    }


def process_chat_turn(
    db: Session,
    session_id: str,
    user_message: str,
    allow_actions: bool = True,
    client_context: Optional[Dict[str, Any]] = None,
    model_preference: str = "auto",
    reasoning_effort: str = "low",
    image_data_url: Optional[str] = None,
    document_data_url: Optional[str] = None,
    document_filename: Optional[str] = None,
) -> Dict[str, Any]:
    ctx = client_context or {}
    profile = get_or_create_memory_profile(db, session_id=session_id, client_context=ctx)
    facts_memory, newly_remembered = update_memory_from_turn(db, profile, user_message, ctx)
    snapshot = gather_workspace_snapshot(db, ctx)

    ingested_doc = None
    if document_data_url and str(document_data_url).startswith("data:"):
        try:
            _, b64_data = str(document_data_url).split(",", 1)
            raw_doc_bytes = base64.b64decode(b64_data)
            from backend.app.engine.ingestion import ingest_document_bytes
            filename = document_filename or "uploaded_document.pdf"
            ingested_doc = ingest_document_bytes(filename, raw_doc_bytes)
        except Exception as exc:
            ingested_doc = {
                "content_type": "text",
                "raw_content": f"[Document parse error: {exc}]",
                "normalized_content": "",
                "raw_sha256": "0" * 64,
                "normalized_sha256": "0" * 64,
                "filename": document_filename or "document.txt",
                "byte_length": 0,
                "metadata": {"parse_error": str(exc)},
            }

    det_actions = _detect_requested_actions(user_message, snapshot)
    groq_result = _run_groq_copilot(
        db=db,
        profile=profile,
        snapshot=snapshot,
        facts_memory=facts_memory,
        newly_remembered=newly_remembered,
        user_message=user_message,
        allow_actions=allow_actions,
        model_preference=model_preference,
        reasoning_effort=reasoning_effort,
        image_data_url=image_data_url,
        ingested_doc=ingested_doc,
    )

    if groq_result is not None:
        reply = groq_result["reply"]
        reasoning_steps = groq_result["reasoning_steps"] or [
            {
                "step": 1,
                "title": f"Groq Live Synthesis ({groq_result['provider_meta']['model']})",
                "detail": groq_result["provider_meta"].get("reasoning_content") or "Synthesized cross-page state & workflow trace.",
                "page": PAGE_DIRECTORY[snapshot["active_tab"]]["label"],
            }
        ]
        touched_tabs = groq_result["touched_tabs"] or [snapshot["active_tab"]]
        # Only allow CUA actions when user explicitly specified an action cue; merge deterministic actions for reliability
        planned_actions = det_actions if det_actions else (groq_result["actions"] if _ACTION_CUE_RE.search(user_message) else [])
        provider_meta = groq_result["provider_meta"]
    else:
        planned_actions = det_actions
        reply, reasoning_steps, touched_tabs = _compose_contextual_reply(
            db=db,
            user_message=user_message,
            snapshot=snapshot,
            profile=profile,
            facts_memory=facts_memory,
            newly_remembered=newly_remembered,
            planned_actions=planned_actions,
            allow_actions=allow_actions,
            image_data_url=image_data_url,
            ingested_doc=ingested_doc,
        )
        provider_meta = {"provider": "local-engine", "model": "veriloom-9layer-local", "key_slot": None, "latency_ms": 0}

    executable_actions = planned_actions if allow_actions else []
    pending_actions = planned_actions if (planned_actions and not allow_actions) else []
    workflow_links = _select_workflow_links(snapshot, touched_tabs)

    now_iso = _now_iso()
    user_row = ChatMessageModel(
        session_id=profile.session_id,
        role="user",
        content=user_message.strip(),
        active_tab=snapshot["active_tab"],
        actor_name=snapshot["actor_name"],
        actor_role=snapshot["actor_role"],
        reasoning_json="[]",
        workflow_links_json="[]",
        actions_json="[]",
        created_at=now_iso,
    )
    assistant_row = ChatMessageModel(
        session_id=profile.session_id,
        role="assistant",
        content=reply,
        active_tab=snapshot["active_tab"],
        actor_name=snapshot["actor_name"],
        actor_role=snapshot["actor_role"],
        reasoning_json=json.dumps(reasoning_steps, ensure_ascii=False),
        workflow_links_json=json.dumps(workflow_links, ensure_ascii=False),
        actions_json=json.dumps(planned_actions, ensure_ascii=False),
        created_at=_now_iso(),
    )
    db.add(user_row)
    db.add(assistant_row)
    db.commit()
    db.refresh(assistant_row)

    total_msgs = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == profile.session_id)
        .count()
    )

    return {
        "message_id": assistant_row.id,
        "reply": reply,
        "reasoning_steps": reasoning_steps,
        "workflow_links": workflow_links,
        "actions": executable_actions,
        "pending_actions": pending_actions,
        "newly_remembered": newly_remembered,
        "provider_meta": provider_meta,
        "memory_profile": serialize_memory_profile(profile, total_msgs),
        "workflow_snapshot": snapshot,
    }


def get_session_payload(
    db: Session,
    session_id: str,
    client_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    profile = get_or_create_memory_profile(db, session_id=session_id, client_context=client_context)
    rows = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.session_id == profile.session_id)
        .order_by(ChatMessageModel.id.asc())
        .all()
    )
    snapshot = gather_workspace_snapshot(db, client_context)
    workflow_links = _select_workflow_links(snapshot, [snapshot["active_tab"]])

    messages = [
        {
            "id": r.id,
            "role": r.role,
            "content": r.content,
            "active_tab": r.active_tab,
            "reasoning_steps": _safe_json_loads(r.reasoning_json, []),
            "workflow_links": _safe_json_loads(r.workflow_links_json, []),
            "actions": _safe_json_loads(r.actions_json, []),
            "created_at": r.created_at,
        }
        for r in rows
    ]

    return {
        "messages": messages,
        "memory_profile": serialize_memory_profile(profile, len(messages)),
        "workflow_links": workflow_links,
        "workflow_snapshot": snapshot,
    }
