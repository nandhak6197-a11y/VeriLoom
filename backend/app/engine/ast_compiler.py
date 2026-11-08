# -*- coding: utf-8 -*-
"""Guideline Importer, Brand-AST Compiler & Guideline Linter (Hypothesis H5)."""
import re
from typing import List, Dict, Any

VAGUE_BUZZWORDS = {
    "punchy",
    "synergistic",
    "effortlessly vibrant",
    "modern vibe",
    "edgy",
    "dynamic feel",
    "pop more",
    "exciting energy",
    "authentic essence",
}


def compile_markdown_guidelines_to_ast(markdown_text: str, tenant: str = "northwind_academy") -> List[Dict[str, Any]]:
    """
    Compiles prose/Markdown guidelines (e.g., '- TERM-01: Write \"learners\" in external copy. Do not use \"students\".')
    into structured Deontic Brand-AST rule objects for human confirmation (§4.3 Step 1).
    """
    compiled_rules: List[Dict[str, Any]] = []
    current_section = "General"
    rule_line_re = re.compile(r"^[-*]\s*([A-Z]+-\d+)\s*:\s*(.+)$")

    for raw_line in markdown_text.splitlines():
        line = raw_line.strip()
        if line.startswith("##"):
            current_section = line.lstrip("#").strip()
            continue

        m = rule_line_re.match(line)
        if not m:
            continue

        rule_id, desc = m.group(1).strip(), m.group(2).strip()
        lower_desc = desc.lower()

        # Determine deontic modality (MUST, FORBIDDEN, CONDITIONAL)
        if any(p in lower_desc for p in ["do not", "no ", "not permitted", "never"]):
            modality = "FORBIDDEN"
        elif "if " in lower_desc or "when " in lower_desc:
            modality = "CONDITIONAL"
        else:
            modality = "MUST"

        # Extract quoted terms
        quoted = re.findall(r'"([^"]+)"|\'([^\']+)\'', desc)
        extracted_quotes = [q[0] or q[1] for q in quoted if (q[0] or q[1])]

        forbidden_terms = []
        preferred_map = {}
        if modality == "FORBIDDEN" and extracted_quotes:
            if "write " in lower_desc or "use " in lower_desc:
                # e.g. Write "learners" ... Do not use "students"
                if lower_desc.find("do not") > lower_desc.find("write") and len(extracted_quotes) >= 2:
                    pref = extracted_quotes[0]
                    forb = extracted_quotes[1:]
                    forbidden_terms.extend(forb)
                    for f_term in forb:
                        preferred_map[f_term] = pref
                elif len(extracted_quotes) >= 2 and lower_desc.find("do not") < lower_desc.find("use", lower_desc.find("do not") + 6):
                    forb = extracted_quotes[0]
                    pref = extracted_quotes[1]
                    forbidden_terms.append(forb)
                    preferred_map[forb] = pref
                else:
                    forbidden_terms.extend(extracted_quotes)
            else:
                forbidden_terms.extend(extracted_quotes)

        category = current_section.lower()
        check_type = "deterministic" if forbidden_terms or category in ("terminology", "accessibility", "format") else "semantic"

        compiled_rules.append({
            "rule_id": rule_id,
            "tenant": tenant,
            "version": "v1.0.0",
            "modality": modality,
            "category": category,
            "check_type": check_type,
            "severity": "Violation",
            "high_risk": category in ("claims", "claim", "legal"),
            "source_clause": f"{current_section} [{rule_id}]",
            "description": desc,
            "patterns": {
                "forbidden_terms": forbidden_terms,
                "preferred_map": preferred_map,
            },
            "examples": {"positive": [], "negative": []},
        })

    return compiled_rules


def lint_guideline_rules(rules: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Audits a Brand-AST rule set for specification defects (§4.3 Step 1 & Hypothesis H5):
      1. CONTRADICTORY_RULES: Term required in one rule and forbidden in another.
      2. MISSING_EXAMPLES: Rule lacks positive or negative anchor examples.
      3. UNCHECKABLE_VAGUE_CLAUSE: Vague subjective adjectives with no deterministic patterns or semantic anchors.
      4. OVERLAPPING_SCOPE: Duplicate forbidden terms across multiple rules.
    """
    defects: List[Dict[str, Any]] = []

    forbidden_term_owners: Dict[str, List[str]] = {}
    required_term_owners: Dict[str, List[str]] = {}

    for rule in rules:
        r_id = rule.get("rule_id", "UNKNOWN")
        desc = rule.get("description", "")
        modality = rule.get("modality", "MUST")
        patterns = rule.get("patterns", {}) or {}
        examples = rule.get("examples", {}) or {}

        forb_list = [t.lower() for t in patterns.get("forbidden_terms", [])]
        req_list = [t.lower() for t in patterns.get("required_terms", [])]
        # Also infer required terms from preferred_map values
        for pref_val in (patterns.get("preferred_map", {}) or {}).values():
            req_list.append(pref_val.lower())

        for t in forb_list:
            forbidden_term_owners.setdefault(t, []).append(r_id)
        for t in set(req_list):
            required_term_owners.setdefault(t, []).append(r_id)

        # Check 1: Missing examples
        pos_ex = examples.get("positive", [])
        neg_ex = examples.get("negative", [])
        if not pos_ex or not neg_ex:
            defects.append({
                "defect_type": "MISSING_EXAMPLES",
                "rule_id": r_id,
                "severity": "Medium",
                "explanation": f"Rule {r_id} is missing {'both positive and negative' if (not pos_ex and not neg_ex) else ('positive' if not pos_ex else 'negative')} verification examples.",
                "remediation": "Add at least one compliant and one non-compliant sentence example in Guideline Lab.",
            })

        # Check 2: Uncheckable vague clause
        has_concrete_signals = bool(
            forb_list
            or req_list
            or patterns.get("semantic_anchors")
            or patterns.get("regex_violation")
            or patterns.get("quantified_claim_regex")
            or patterns.get("outcome_keywords")
            or patterns.get("fact_categories")
            or patterns.get("min_contrast_ratio")
            or patterns.get("max_delta_e00")
            or patterns.get("aspect_ratio")
        )
        matched_vague = [bw for bw in VAGUE_BUZZWORDS if bw in desc.lower()]
        if not has_concrete_signals or matched_vague:
            defects.append({
                "defect_type": "UNCHECKABLE_VAGUE_CLAUSE",
                "rule_id": r_id,
                "severity": "High",
                "explanation": (
                    f"Rule {r_id} contains subjective, uncheckable phrasing "
                    f"({', '.join(matched_vague) if matched_vague else 'no testable pattern or anchor'})."
                ),
                "remediation": "Rewrite using concrete FORBIDDEN/MUST terms or measurable semantic anchors.",
            })

    # Check 3: Contradictions (term in both FORBIDDEN and MUST/preferred)
    for term, forb_rules in forbidden_term_owners.items():
        if term in required_term_owners:
            req_rules = required_term_owners[term]
            conflict_pairs = [f"{fr} vs {rr}" for fr in forb_rules for rr in req_rules if fr != rr]
            if conflict_pairs:
                defects.append({
                    "defect_type": "CONTRADICTORY_RULES",
                    "rule_id": forb_rules[-1],
                    "conflicting_rules": list(set(forb_rules + req_rules)),
                    "term": term,
                    "severity": "Critical",
                    "explanation": f"Term '{term}' is FORBIDDEN in {forb_rules} but REQUIRED/PREFERRED in {req_rules}.",
                    "remediation": "Resolve precedence or scope exception before publishing the rule set.",
                })

    # Check 4: Overlapping scope (same forbidden term in multiple rules)
    for term, owners in forbidden_term_owners.items():
        unique_owners = list(dict.fromkeys(owners))
        if len(unique_owners) > 1:
            defects.append({
                "defect_type": "OVERLAPPING_SCOPE",
                "rule_id": unique_owners[-1],
                "overlapping_rules": unique_owners,
                "term": term,
                "severity": "Low",
                "explanation": f"Term '{term}' is checked redundantly across multiple rules: {', '.join(unique_owners)}.",
                "remediation": "Consolidate duplicate term checks into a single canonical rule ID.",
            })

    flagged_set = set()
    for d in defects:
        flagged_set.add(d["rule_id"])
        for cr in d.get("conflicting_rules", []):
            flagged_set.add(cr)
        for or_id in d.get("overlapping_rules", []):
            flagged_set.add(or_id)
    flagged_rule_ids = sorted(flagged_set)
    return {
        "total_rules_scanned": len(rules),
        "total_defects_found": len(defects),
        "flagged_rule_ids": flagged_rule_ids,
        "defects": defects,
    }
