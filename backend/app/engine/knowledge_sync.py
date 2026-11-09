# -*- coding: utf-8 -*-
"""
Improvement 1: Live Enterprise Fact-Graph & Knowledge Sync Engine (§Round 3).

Connects VeriLoom's Fact Vault to enterprise documentation (Confluence, Notion,
Google Workspace exports, and structured JSON/CSV feeds) via schema-guided
relation extraction, provenance hashing, validity window scheduling, and
real-time queue blast-radius conflict detection.
"""
import re
import json
import hashlib
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Tuple, Optional


def compute_sha256_text(text: str) -> str:
    """Computes SHA-256 digest of normalized input text."""
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


class EnterpriseKnowledgeSyncEngine:
    """
    Ingests unstructured corporate docs, extracts verified atomic facts,
    assigns time-bounded validity windows, and calculates queue blast-radius.
    """

    # Regex patterns for common enterprise fact tuple extractions
    PATTERNS = [
        # Tuition / Discount / Pricing: "Tuition discount is 30% for Q4 2026"
        (
            r"(?P<subject>[A-Z][A-Za-z0-9\s]+?)\s+(?:offers?|has|provides?|discount is|is offering|slashed)\s+(?P<metric>\d+%(?:\s+discount|\s+off)?|\$\d+(?:,\d+)?|\£\d+(?:,\d+)?)",
            "pricing_discount",
            "pricing",
        ),
        # Duration: "Data Foundations takes 16 weeks"
        (
            r"(?P<subject>[A-Z][A-Za-z0-9\s]+?)\s+(?:takes|runs for|duration is|is|lasts)\s+(?P<metric>\d+\s+(?:weeks?|months?|days?|hours?))",
            "program_duration",
            "curriculum",
        ),
        # Outcome / Pass rate: "AWS Cohort achieved a 94% job placement rate"
        (
            r"(?P<subject>[A-Z][A-Za-z0-9\s]+?)\s+(?:achieved|recorded|reports?|reached)\s+(?:a\s+)?(?P<metric>\d+%\s+[A-Za-z\s]+?(?:rate|score|placement|pass rate))",
            "outcome_metric",
            "outcomes",
        ),
        # Capacity / Cohort size: "Cohort size is capped at 30 students"
        (
            r"(?P<subject>[A-Z][A-Za-z0-9\s]+?)\s+(?:is capped at|limits class size to|seats up to)\s+(?P<metric>\d+\s+(?:learners?|students?|seats?|participants?))",
            "capacity_limit",
            "operations",
        ),
    ]

    def __init__(self, tenant: str = "northwind_academy"):
        self.tenant = tenant

    def extract_atomic_facts_from_document(
        self,
        document_text: str,
        source_name: str = "Enterprise Document",
        source_type: str = "confluence_page",
        default_valid_days: int = 180,
        source_title: Optional[str] = None,
        doc_type: Optional[str] = None,
        effective_year: Optional[int] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """
        Extracts verified atomic facts from enterprise text with cryptographic
        source provenance and validity window scheduling.
        """
        if source_title:
            source_name = source_title
        if doc_type:
            source_type = doc_type

        source_sha256 = compute_sha256_text(document_text)
        if effective_year:
            today = date(effective_year, 1, 1)
        else:
            today = date.today()

        valid_from = today.isoformat()
        valid_until = (today + timedelta(days=default_valid_days)).isoformat()

        extracted_facts: List[Dict[str, Any]] = []
        seen_keys = set()
        fact_counter = 1

        # 1. Structured JSON Feed Ingestion
        cleaned_text = document_text.strip()
        if cleaned_text.startswith(("{", "[")):
            try:
                parsed_json = json.loads(cleaned_text)
                items = parsed_json if isinstance(parsed_json, list) else parsed_json.get("facts", [parsed_json])
                for item in items:
                    if isinstance(item, dict) and "subject" in item and "metric" in item:
                        s_name = item.get("subject", "").strip()
                        m_val = str(item.get("metric", "")).strip()
                        p_val = item.get("predicate", "states").strip()
                        cat = item.get("category", "operations")
                        stmt = item.get("statement", f"{s_name} {p_val} {m_val}")
                        dedup = f"{s_name.lower()}:{p_val}:{m_val.lower()}"
                        if dedup not in seen_keys:
                            seen_keys.add(dedup)
                            f_id = f"F-SYNC-JSON-{hashlib.md5(dedup.encode()).hexdigest()[:6].upper()}"
                            extracted_facts.append({
                                "fact_id": f_id,
                                "tenant": self.tenant,
                                "category": cat,
                                "subject": s_name,
                                "predicate": p_val,
                                "metric": m_val,
                                "modality": item.get("modality", "strict"),
                                "statement": stmt,
                                "owner": f"Enterprise Sync ({source_name})",
                                "source": f"{source_type}:{source_name}",
                                "source_sha256": source_sha256,
                                "provenance_hash": source_sha256,
                                "valid_from": item.get("valid_from", valid_from),
                                "valid_until": item.get("valid_until", valid_until),
                                "status": "ACTIVE" if item.get("valid_until", valid_until) >= date.today().isoformat() else "EXPIRED",
                            })
                if extracted_facts:
                    return extracted_facts
            except Exception:
                pass

        # 2. Structured CSV Feed Ingestion
        if "\n" in cleaned_text and ("," in cleaned_text or "\t" in cleaned_text) and not cleaned_text.startswith("#"):
            try:
                import csv
                import io
                delimiter = "\t" if "\t" in cleaned_text.splitlines()[0] else ","
                reader = csv.DictReader(io.StringIO(cleaned_text), delimiter=delimiter)
                for row in reader:
                    low_row = {k.strip().lower(): v.strip() for k, v in row.items() if k}
                    if "subject" in low_row and "metric" in low_row:
                        s_name = low_row["subject"]
                        m_val = low_row["metric"]
                        p_val = low_row.get("predicate", "states")
                        cat = low_row.get("category", "general")
                        stmt = low_row.get("statement", f"{s_name} {p_val} {m_val}")
                        dedup = f"{s_name.lower()}:{p_val}:{m_val.lower()}"
                        if dedup not in seen_keys:
                            seen_keys.add(dedup)
                            f_id = f"F-SYNC-CSV-{hashlib.md5(dedup.encode()).hexdigest()[:6].upper()}"
                            extracted_facts.append({
                                "fact_id": f_id,
                                "tenant": self.tenant,
                                "category": cat,
                                "subject": s_name,
                                "predicate": p_val,
                                "metric": m_val,
                                "modality": low_row.get("modality", "strict"),
                                "statement": stmt,
                                "owner": f"Enterprise Sync ({source_name})",
                                "source": f"{source_type}:{source_name}",
                                "source_sha256": source_sha256,
                                "provenance_hash": source_sha256,
                                "valid_from": low_row.get("valid_from", valid_from),
                                "valid_until": low_row.get("valid_until", valid_until),
                                "status": "ACTIVE" if low_row.get("valid_until", valid_until) >= date.today().isoformat() else "EXPIRED",
                            })
                if extracted_facts:
                    return extracted_facts
            except Exception:
                pass

        # 3. Unstructured Prose Ingestion (Sentence-level Regex)
        clauses = re.split(r"(?<=[.!?\n])\s+", document_text.strip())

        fact_counter = 1
        for clause in clauses:
            clause_clean = clause.strip()
            if not clause_clean or len(clause_clean) < 10:
                continue

            for pattern, predicate, category in self.PATTERNS:
                match = re.search(pattern, clause_clean, re.IGNORECASE)
                if match:
                    subj = match.group("subject").strip()
                    metric = match.group("metric").strip()

                    # Deduplicate within document
                    dedup_key = f"{subj.lower()}:{predicate}:{metric.lower()}"
                    if dedup_key in seen_keys:
                        continue
                    seen_keys.add(dedup_key)

                    fact_id = f"F-SYNC-{hashlib.md5(dedup_key.encode()).hexdigest()[:6].upper()}"

                    # Check for explicit expiration date in clause
                    exp_match = re.search(r"valid (?:until|through|to)\s+(\d{4}-\d{2}-\d{2})", clause_clean, re.IGNORECASE)
                    actual_valid_until = exp_match.group(1) if exp_match else valid_until

                    extracted_facts.append({
                        "fact_id": fact_id,
                        "tenant": self.tenant,
                        "category": category,
                        "subject": subj,
                        "predicate": predicate,
                        "metric": metric,
                        "modality": "strict",
                        "statement": clause_clean,
                        "owner": f"Enterprise Sync ({source_name})",
                        "source": f"{source_type}:{source_name}",
                        "source_sha256": source_sha256,
                        "provenance_hash": source_sha256,
                        "valid_from": valid_from,
                        "valid_until": actual_valid_until,
                        "status": "ACTIVE" if actual_valid_until >= date.today().isoformat() else "EXPIRED",
                    })
                    fact_counter += 1

        return extracted_facts

    def calculate_queue_blast_radius(
        self,
        new_facts: List[Dict[str, Any]],
        pending_submissions: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Evaluates the blast-radius across pending queue assets:
        Detects if any newly ingested facts contradict or obsolete existing copy.
        """
        impacted_assets: List[Dict[str, Any]] = []

        for sub in pending_submissions:
            content = sub.get("current_content") or sub.get("raw_content", "")
            asset_id = sub.get("asset_id", "UNKNOWN")
            title = sub.get("title", "")

            conflicts = []
            supports = []

            for f in new_facts:
                subj = (f.get("subject") or "").lower()
                metric = (f.get("metric") or "").lower()
                f_cat = f.get("category", "")
                f_status = f.get("status", "ACTIVE")

                # If the asset mentions the subject or related domain keywords
                subj_words = [w for w in subj.split() if len(w) > 3]
                subj_matches = (subj and subj in content.lower()) or any(w in content.lower() for w in subj_words) or ("discount" in content.lower() and (f_cat == "pricing" or "%" in metric))
                if subj_matches:
                    # Check if the asset mentions a DIFFERENT number/metric for the same subject
                    if f_cat == "curriculum" and "week" in metric:
                        # Duration check
                        dur_match = re.search(r"(\d+)\s+weeks?", content, re.IGNORECASE)
                        if dur_match and dur_match.group(0).lower() != metric:
                            conflicts.append({
                                "fact_id": f.get("fact_id"),
                                "type": "DURATION_MISMATCH",
                                "draft_claim": dur_match.group(0),
                                "verified_fact": metric,
                                "explanation": f"Draft asserts {dur_match.group(0)} for {f.get('subject')}, but enterprise doc states {metric} ({f_status}).",
                            })
                    elif (f_cat == "pricing" or "%" in metric) and "%" in metric:
                        disc_match = re.search(r"(\d+%)", content)
                        if disc_match and disc_match.group(0).lower() != metric:
                            conflicts.append({
                                "fact_id": f.get("fact_id"),
                                "type": "DISCOUNT_MISMATCH",
                                "draft_claim": disc_match.group(0),
                                "verified_fact": metric,
                                "explanation": f"Draft asserts {disc_match.group(0)} for {f.get('subject')}, but enterprise doc specifies {metric}.",
                            })
                    elif metric and metric in content.lower():
                        supports.append({
                            "fact_id": f.get("fact_id"),
                            "matched_metric": metric,
                            "status": f_status,
                        })

            if conflicts or supports:
                impacted_assets.append({
                    "asset_id": asset_id,
                    "title": title,
                    "conflict_count": len(conflicts),
                    "conflicts": conflicts,
                    "supported_count": len(supports),
                    "supports": supports,
                    "action_required": "RE_VERIFY" if conflicts else "AUTO_CONFIRM",
                })

        return {
            "total_new_facts": len(new_facts),
            "pending_submissions_analyzed": len(pending_submissions),
            "impacted_assets_count": len(impacted_assets),
            "impacted_assets": impacted_assets,
            "blast_radius_risk": "HIGH" if any(a["conflict_count"] > 0 for a in impacted_assets) else "LOW",
        }

    def generate_knowledge_graph_representation(
        self,
        facts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Formats facts into a graph structure (nodes & edges) for interactive
        frontend visualization in the Fact Vault.
        """
        nodes: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []
        node_ids = set()

        for f in facts:
            # Fact node
            f_node_id = f["fact_id"]
            if f_node_id not in node_ids:
                nodes.append({
                    "id": f_node_id,
                    "label": f"{f['fact_id']}: {f['metric']}",
                    "type": "fact",
                    "category": f.get("category", "general"),
                    "status": f.get("status", "ACTIVE"),
                    "details": f.get("statement", ""),
                })
                node_ids.add(f_node_id)

            # Subject node
            subj_id = f"SUBJ-{hashlib.md5(f['subject'].encode()).hexdigest()[:6]}"
            if subj_id not in node_ids:
                nodes.append({
                    "id": subj_id,
                    "label": f["subject"],
                    "type": "subject",
                    "category": f.get("category", "general"),
                    "status": "ACTIVE",
                    "details": f"Entity: {f['subject']}",
                })
                node_ids.add(subj_id)

            # Edge: Subject -> Fact
            edges.append({
                "id": f"E-{subj_id}-{f_node_id}",
                "source": subj_id,
                "target": f_node_id,
                "label": f.get("predicate", "states"),
                "status": f.get("status", "ACTIVE"),
            })

        return {
            "nodes": nodes,
            "edges": edges,
            "node_count": len(nodes),
            "edge_count": len(edges),
        }
