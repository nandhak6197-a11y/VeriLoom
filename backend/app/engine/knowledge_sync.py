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


def compute_sha256_text(text: Any) -> str:
    """Computes SHA-256 digest of normalized input text or raw bytes."""
    if isinstance(text, bytes):
        return hashlib.sha256(text).hexdigest()
    if not isinstance(text, str):
        text = str(text)
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def parse_iso_date_safely(date_val: Any, fallback: Optional[date] = None) -> Optional[date]:
    """
    Standardizes and parses varied date representations into a valid datetime.date object.
    Robustly handles:
    - Non-zero-padded months and days (e.g. '2026-9-1' -> 2026-09-01)
    - Slash/dot separators ('2026/09/01', '2026.9.1')
    - Timestamp strings containing 'T' or timezone offsets
    - Invalid or null inputs ('None', 'null', '', None) returning the provided fallback.
    Prevents erroneous ASCII string sorting when determining temporal validity.
    """
    if date_val is None:
        return fallback
    if isinstance(date_val, date) and not isinstance(date_val, datetime):
        return date_val
    if isinstance(date_val, datetime):
        return date_val.date()

    val_str = str(date_val).strip()
    if not val_str or val_str.lower() in ("none", "null", "undefined", "n/a", "nat", "nan"):
        return fallback

    # If ISO timestamp containing 'T', validate the full ISO string
    if "T" in val_str:
        try:
            clean_iso = val_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_iso)
            return dt.date()
        except Exception:
            return fallback

    val_str = val_str.split(" ")[0].strip()

    # Pattern 1: YYYY-M-D or YYYY/M/D or YYYY.M.D
    m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", val_str)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return fallback

    # Pattern 2: D-M-YYYY or M/D/YYYY
    m = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", val_str)
    if m:
        try:
            p1, p2, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if p1 > 12:  # Day first: DD/MM/YYYY
                return date(yr, p2, p1)
            else:  # MM/DD/YYYY or DD/MM/YYYY
                return date(yr, p1, p2)
        except ValueError:
            return fallback

    # Fallback to standard strptime attempts
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(val_str, fmt).date()
        except ValueError:
            continue

    return fallback


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
        document_text: Any,
        source_name: str = "Enterprise Document",
        source_type: str = "confluence_page",
        default_valid_days: int = 180,
        source_title: Optional[str] = None,
        doc_type: Optional[str] = None,
        effective_year: Optional[int] = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """
        Extracts verified atomic facts from enterprise text or bytes (JSON, CSV, markdown, or prose)
        with SHA-256 cryptographic source provenance and time-bounded validity window scheduling.
        """
        if source_title:
            source_name = source_title
        if doc_type:
            source_type = doc_type

        # Compute SHA-256 cryptographic provenance digest over source document
        source_sha256 = compute_sha256_text(document_text)

        if isinstance(document_text, bytes):
            doc_str = document_text.decode("utf-8", errors="replace")
        elif not isinstance(document_text, str):
            doc_str = str(document_text)
        else:
            doc_str = document_text

        if effective_year:
            today = date(effective_year, 1, 1)
        else:
            today = date.today()

        valid_from = today.isoformat()
        valid_until = (today + timedelta(days=default_valid_days)).isoformat()
        ref_date = today.isoformat()

        extracted_facts: List[Dict[str, Any]] = []
        seen_keys = set()

        # 1. Structured JSON Feed Ingestion
        cleaned_text = doc_str.strip()
        if cleaned_text.startswith(("{", "[")):
            try:
                parsed_json = json.loads(cleaned_text)
                if isinstance(parsed_json, list):
                    items = parsed_json
                elif isinstance(parsed_json, dict):
                    items = parsed_json.get("facts") or parsed_json.get("items") or parsed_json.get("data") or [parsed_json]
                else:
                    items = []
                for item in items:
                    if isinstance(item, dict):
                        norm_item = {k.strip().lower(): v for k, v in item.items() if isinstance(k, str)}
                        if "subject" in norm_item and "metric" in norm_item:
                            s_name = str(norm_item.get("subject", "")).strip()
                            m_val = str(norm_item.get("metric", "")).strip()
                            p_val = str(norm_item.get("predicate", "states")).strip()
                            cat = str(norm_item.get("category", "operations")).strip()
                            stmt = str(norm_item.get("statement", f"{s_name} {p_val} {m_val}")).strip()
                            item_valid_from = str(norm_item.get("valid_from", valid_from)).strip()
                            item_valid_until = str(norm_item.get("valid_until", valid_until)).strip()
                            parsed_vf = parse_iso_date_safely(item_valid_from, fallback=today)
                            parsed_vu = parse_iso_date_safely(item_valid_until, fallback=today + timedelta(days=default_valid_days))
                            norm_vf = parsed_vf.isoformat() if parsed_vf else valid_from
                            norm_vu = parsed_vu.isoformat() if parsed_vu else valid_until
                            item_status = "ACTIVE" if (parsed_vu and parsed_vu >= today) else "EXPIRED"
                            dedup = f"{s_name.lower()}:{p_val}:{m_val.lower()}"
                            if dedup not in seen_keys:
                                seen_keys.add(dedup)
                                f_id = f"F-SYNC-{hashlib.md5(dedup.encode()).hexdigest()[:6].upper()}"
                                extracted_facts.append({
                                    "fact_id": f_id,
                                    "tenant": self.tenant,
                                    "category": cat,
                                    "subject": s_name,
                                    "predicate": p_val,
                                    "metric": m_val,
                                    "modality": norm_item.get("modality", "strict"),
                                    "statement": stmt,
                                    "owner": f"Enterprise Sync ({source_name})",
                                    "source": f"{source_type}:{source_name}",
                                    "source_sha256": source_sha256,
                                    "provenance_hash": source_sha256,
                                    "valid_from": norm_vf,
                                    "valid_until": norm_vu,
                                    "status": item_status,
                                })
                if extracted_facts:
                    return extracted_facts
            except Exception:
                pass

        # 2. Structured CSV / TSV Feed Ingestion
        first_line = cleaned_text.splitlines()[0] if cleaned_text else ""
        has_csv_delim = any(d in first_line for d in (",", "\t", ";"))
        if has_csv_delim and not cleaned_text.startswith("#"):
            try:
                import csv
                import io
                delimiter = "\t" if "\t" in first_line else (";" if ";" in first_line else ",")
                reader = csv.DictReader(io.StringIO(cleaned_text), delimiter=delimiter)
                for row in reader:
                    low_row = {k.strip().lower(): v.strip() for k, v in row.items() if k and v is not None}
                    if "subject" in low_row and "metric" in low_row:
                        s_name = low_row["subject"]
                        m_val = low_row["metric"]
                        p_val = low_row.get("predicate", "states")
                        cat = low_row.get("category", "general")
                        stmt = low_row.get("statement", f"{s_name} {p_val} {m_val}")
                        item_valid_from = low_row.get("valid_from", valid_from)
                        item_valid_until = low_row.get("valid_until", valid_until)
                        parsed_vf = parse_iso_date_safely(item_valid_from, fallback=today)
                        parsed_vu = parse_iso_date_safely(item_valid_until, fallback=today + timedelta(days=default_valid_days))
                        norm_vf = parsed_vf.isoformat() if parsed_vf else valid_from
                        norm_vu = parsed_vu.isoformat() if parsed_vu else valid_until
                        item_status = "ACTIVE" if (parsed_vu and parsed_vu >= today) else "EXPIRED"
                        dedup = f"{s_name.lower()}:{p_val}:{m_val.lower()}"
                        if dedup not in seen_keys:
                            seen_keys.add(dedup)
                            f_id = f"F-SYNC-{hashlib.md5(dedup.encode()).hexdigest()[:6].upper()}"
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
                                "valid_from": norm_vf,
                                "valid_until": norm_vu,
                                "status": item_status,
                            })
                if extracted_facts:
                    return extracted_facts
            except Exception:
                pass

        # 3. Markdown Table Feed Ingestion
        if "|" in cleaned_text and ("-|-" in cleaned_text or "|---" in cleaned_text):
            try:
                lines = [l.strip() for l in cleaned_text.splitlines() if l.strip().startswith("|")]
                if len(lines) >= 3:
                    headers = [h.strip().lower() for h in lines[0].strip("|").split("|")]
                    if "subject" in headers and "metric" in headers:
                        s_idx = headers.index("subject")
                        m_idx = headers.index("metric")
                        p_idx = headers.index("predicate") if "predicate" in headers else -1
                        c_idx = headers.index("category") if "category" in headers else -1
                        st_idx = headers.index("statement") if "statement" in headers else -1
                        vf_idx = headers.index("valid_from") if "valid_from" in headers else -1
                        vu_idx = headers.index("valid_until") if "valid_until" in headers else -1
                        for line in lines[2:]:
                            cells = [c.strip() for c in line.strip("|").split("|")]
                            if len(cells) > max(s_idx, m_idx):
                                s_name = cells[s_idx]
                                m_val = cells[m_idx]
                                p_val = cells[p_idx] if p_idx != -1 and len(cells) > p_idx and cells[p_idx] else "states"
                                cat = cells[c_idx] if c_idx != -1 and len(cells) > c_idx and cells[c_idx] else "general"
                                stmt = cells[st_idx] if st_idx != -1 and len(cells) > st_idx and cells[st_idx] else f"{s_name} {p_val} {m_val}"
                                item_valid_from = cells[vf_idx] if vf_idx != -1 and len(cells) > vf_idx and cells[vf_idx] else valid_from
                                item_valid_until = cells[vu_idx] if vu_idx != -1 and len(cells) > vu_idx and cells[vu_idx] else valid_until
                                parsed_vf = parse_iso_date_safely(item_valid_from, fallback=today)
                                parsed_vu = parse_iso_date_safely(item_valid_until, fallback=today + timedelta(days=default_valid_days))
                                norm_vf = parsed_vf.isoformat() if parsed_vf else valid_from
                                norm_vu = parsed_vu.isoformat() if parsed_vu else valid_until
                                item_status = "ACTIVE" if (parsed_vu and parsed_vu >= today) else "EXPIRED"
                                dedup = f"{s_name.lower()}:{p_val}:{m_val.lower()}"
                                if dedup not in seen_keys:
                                    seen_keys.add(dedup)
                                    f_id = f"F-SYNC-{hashlib.md5(dedup.encode()).hexdigest()[:6].upper()}"
                                    extracted_facts.append({
                                        "fact_id": f_id,
                                        "tenant": self.tenant,
                                        "category": cat,
                                        "subject": s_name,
                                        "predicate": p_val,
                                        "metric": m_val,
                                        "modality": "strict",
                                        "statement": stmt,
                                        "owner": f"Enterprise Sync ({source_name})",
                                        "source": f"{source_type}:{source_name}",
                                        "source_sha256": source_sha256,
                                        "provenance_hash": source_sha256,
                                        "valid_from": norm_vf,
                                        "valid_until": norm_vu,
                                        "status": item_status,
                                    })
                        if extracted_facts:
                            return extracted_facts
            except Exception:
                pass

        # 4. Unstructured Prose Ingestion (Sentence-level Regex)
        clauses = re.split(r"(?<=[.!?\n])\s+", doc_str.strip())

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

                    # Explicit valid_from and valid_until in clause, falling back to document-level
                    vf_match = re.search(r"(?:valid|effective)\s+from\s+([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2})", clause_clean, re.IGNORECASE)
                    if not vf_match:
                        vf_match = re.search(r"(?:valid|effective)\s+from\s+([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2})", doc_str, re.IGNORECASE)
                    actual_valid_from = vf_match.group(1) if vf_match else valid_from

                    exp_match = re.search(r"(?:valid\s+(?:until|through|to)|expires?\s*(?:on|at)?|expiration:?)\s*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2})", clause_clean, re.IGNORECASE)
                    if not exp_match:
                        exp_match = re.search(r"(?:valid\s+(?:until|through|to)|expires?\s*(?:on|at)?|expiration:?)\s*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2})", doc_str, re.IGNORECASE)
                    actual_valid_until = exp_match.group(1) if exp_match else valid_until

                    parsed_vf = parse_iso_date_safely(actual_valid_from, fallback=today)
                    parsed_vu = parse_iso_date_safely(actual_valid_until, fallback=today + timedelta(days=default_valid_days))
                    norm_vf = parsed_vf.isoformat() if parsed_vf else valid_from
                    norm_vu = parsed_vu.isoformat() if parsed_vu else valid_until
                    status = "ACTIVE" if (parsed_vu and parsed_vu >= today) else "EXPIRED"

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
                        "valid_from": norm_vf,
                        "valid_until": norm_vu,
                        "status": status,
                    })

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
            content = sub.get("current_content") or sub.get("raw_content", "") or ""
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
                    # 1. Duration check
                    if f_cat == "curriculum" and ("week" in metric or "month" in metric or "day" in metric):
                        dur_match = re.search(r"(\d+)\s+(?:weeks?|months?|days?)", content, re.IGNORECASE)
                        if dur_match:
                            if dur_match.group(0).lower() != metric:
                                conflicts.append({
                                    "fact_id": f.get("fact_id"),
                                    "type": "DURATION_MISMATCH",
                                    "draft_claim": dur_match.group(0),
                                    "verified_fact": metric,
                                    "explanation": f"Draft asserts {dur_match.group(0)} for {f.get('subject')}, but enterprise doc states {metric} ({f_status}).",
                                })
                            else:
                                supports.append({
                                    "fact_id": f.get("fact_id"),
                                    "matched_metric": metric,
                                    "status": f_status,
                                })
                    # 2. Pricing / Discount check
                    elif (f_cat == "pricing" or "%" in metric) and "%" in metric:
                        disc_match = re.search(r"(\d+%)", content)
                        metric_pct_match = re.search(r"(\d+%)", metric)
                        metric_pct = metric_pct_match.group(1).lower() if metric_pct_match else metric.lower()
                        if disc_match:
                            draft_pct = disc_match.group(0).lower()
                            if draft_pct != metric_pct:
                                conflicts.append({
                                    "fact_id": f.get("fact_id"),
                                    "type": "DISCOUNT_MISMATCH",
                                    "draft_claim": disc_match.group(0),
                                    "verified_fact": metric,
                                    "explanation": f"Draft asserts {disc_match.group(0)} for {f.get('subject')}, but enterprise doc specifies {metric}.",
                                })
                            else:
                                supports.append({
                                    "fact_id": f.get("fact_id"),
                                    "matched_metric": metric,
                                    "status": f_status,
                                })
                    # 3. Outcome / Pass rate check
                    elif f_cat == "outcomes" or "placement" in metric or "pass rate" in metric or "rate" in metric:
                        rate_match = re.search(r"(\d+%)\s+(?:job\s+)?(?:placement|pass|employment|success)", content, re.IGNORECASE)
                        if rate_match:
                            if rate_match.group(1).lower() not in metric:
                                conflicts.append({
                                    "fact_id": f.get("fact_id"),
                                    "type": "OUTCOME_MISMATCH",
                                    "draft_claim": rate_match.group(0),
                                    "verified_fact": metric,
                                    "explanation": f"Draft asserts {rate_match.group(0)} for {f.get('subject')}, but enterprise doc specifies {metric} ({f_status}).",
                                })
                            else:
                                supports.append({
                                    "fact_id": f.get("fact_id"),
                                    "matched_metric": metric,
                                    "status": f_status,
                                })
                    # 4. Capacity limit check
                    elif f_cat == "operations" or "cap" in f.get("predicate", "") or "students" in metric or "learners" in metric or "seats" in metric:
                        cap_match = re.search(r"(\d+)\s+(?:students?|learners?|participants?|seats?)", content, re.IGNORECASE)
                        if cap_match:
                            if cap_match.group(0).lower() != metric:
                                conflicts.append({
                                    "fact_id": f.get("fact_id"),
                                    "type": "CAPACITY_MISMATCH",
                                    "draft_claim": cap_match.group(0),
                                    "verified_fact": metric,
                                    "explanation": f"Draft asserts {cap_match.group(0)} for {f.get('subject')}, but enterprise doc specifies {metric} ({f_status}).",
                                })
                            else:
                                supports.append({
                                    "fact_id": f.get("fact_id"),
                                    "matched_metric": metric,
                                    "status": f_status,
                                })
                    # 5. Generic support check
                    if metric and metric in content.lower() and not any(s.get("fact_id") == f.get("fact_id") for s in supports) and not any(c.get("fact_id") == f.get("fact_id") for c in conflicts):
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
        frontend visualization in the Fact Vault, returning all active and expired facts
        with labeled predicate edges.
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
                    "provenance_hash": f.get("provenance_hash") or f.get("source_sha256") or "",
                    "details": f.get("statement", ""),
                })
                node_ids.add(f_node_id)

            # Subject node
            subj_id = f"SUBJ-{hashlib.md5(f['subject'].encode()).hexdigest()[:6].upper()}"
            if subj_id not in node_ids:
                nodes.append({
                    "id": subj_id,
                    "label": f["subject"],
                    "type": "subject",
                    "category": f.get("category", "general"),
                    "status": "ACTIVE",
                    "provenance_hash": "",
                    "details": f"Entity: {f['subject']}",
                })
                node_ids.add(subj_id)

            # Edge: Subject -> Fact
            edges.append({
                "id": f"E-{subj_id}-{f_node_id}",
                "source": subj_id,
                "target": f_node_id,
                "label": f.get("predicate", "states"),
                "predicate": f.get("predicate", "states"),
                "status": f.get("status", "ACTIVE"),
            })

        return {
            "nodes": nodes,
            "edges": edges,
            "node_count": len(nodes),
            "edge_count": len(edges),
        }
