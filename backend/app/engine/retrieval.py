# -*- coding: utf-8 -*-
"""Layer 3: Hybrid Keyword + Semantic Retrieval over Brand-AST Rules and Time-Bounded Fact Vault."""
import re
from datetime import date, datetime
from typing import List, Dict, Any, Tuple
from backend.app.config import DEFAULT_REVIEW_DATE


def parse_iso_date(d_str: str) -> date:
    if not d_str:
        return DEFAULT_REVIEW_DATE
    try:
        return datetime.strptime(d_str[:10], "%Y-%m-%d").date()
    except Exception:
        return DEFAULT_REVIEW_DATE


def is_fact_valid_on_date(fact: Dict[str, Any], check_date: date = None) -> bool:
    """Checks whether a fact is within its [valid_from, valid_until] window on check_date."""
    if check_date is None:
        check_date = DEFAULT_REVIEW_DATE
    v_from = parse_iso_date(fact.get("valid_from", "2020-01-01"))
    v_until = parse_iso_date(fact.get("valid_until", "2099-12-31"))
    return v_from <= check_date <= v_until


def partition_facts_by_validity(
    facts: List[Dict[str, Any]],
    check_date: date = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Partitions Fact Vault entries into (active_facts, expired_or_inactive_facts) on check_date."""
    if check_date is None:
        check_date = DEFAULT_REVIEW_DATE
    active, expired = [], []
    for f in facts:
        if is_fact_valid_on_date(f, check_date):
            active.append(f)
        else:
            expired.append(f)
    return active, expired


def _tokenize(text: str) -> set:
    return {
        w.lower()
        for w in re.findall(r"[A-Za-z0-9£%]+", text)
        if len(w) > 1 and w.lower() not in {"the", "and", "for", "our", "with", "that", "this", "from", "are", "was"}
    }


def retrieve_relevant_facts(
    claim_text: str,
    facts: List[Dict[str, Any]],
    check_date: date = None,
    top_k: int = 3,
) -> Dict[str, Any]:
    """
    Hybrid lexical + domain-concept retrieval over the Fact Vault.
    Returns both the top matching active facts and any matching expired facts so the verifier
    can explicitly cite expired fact IDs (e.g., F-DUR-01 on P13 and F-014 on §4.4 Worked Example).
    """
    if check_date is None:
        check_date = DEFAULT_REVIEW_DATE

    active_facts, expired_facts = partition_facts_by_validity(facts, check_date)
    claim_tokens = _tokenize(claim_text)
    claim_lower = claim_text.lower()

    def _score_fact(f: Dict[str, Any]) -> float:
        f_text = f"{f.get('subject', '')} {f.get('predicate', '')} {f.get('metric', '')} {f.get('statement', '')} {f.get('category', '')}"
        f_tokens = _tokenize(f_text)
        overlap = len(claim_tokens & f_tokens)
        score = float(overlap)
        # Boost subject / category domain match
        subj = f.get("subject", "").lower()
        if subj and subj in claim_lower:
            score += 4.0
        for kw in subj.split():
            if len(kw) > 3 and kw in claim_lower:
                score += 2.0
        # Boost metric overlap
        metric = f.get("metric", "").lower()
        if metric and metric in claim_lower:
            score += 5.0
        # Domain synonym bridges
        if ("onboarding" in claim_lower or "setup" in claim_lower) and f.get("category") == "onboarding":
            score += 4.5
        if ("graduates" in claim_lower or "completers" in claim_lower or "new role" in claim_lower or "promotion" in claim_lower) and f.get("category") == "outcomes":
            score += 4.5
        if ("weeks" in claim_lower or "duration" in claim_lower or "data foundations" in claim_lower) and f.get("category") == "duration":
            score += 4.5
        if ("annual" in claim_lower or "save" in claim_lower or "tuition" in claim_lower) and f.get("category") == "scholarship":
            score += 4.5
        if ("£" in claim_lower or "monthly" in claim_lower or "plans" in claim_lower) and f.get("category") == "pricing":
            score += 4.0
        if ("learners" in claim_lower and "since" in claim_lower) and f.get("category") == "counts":
            score += 4.0
        return score

    scored_active = sorted(
        [(f, _score_fact(f)) for f in active_facts],
        key=lambda x: x[1],
        reverse=True,
    )
    scored_expired = sorted(
        [(f, _score_fact(f)) for f in expired_facts],
        key=lambda x: x[1],
        reverse=True,
    )

    top_act = scored_active[0][1] if scored_active else 0.0
    top_exp = scored_expired[0][1] if scored_expired else 0.0
    # Normalize raw lexical+domain score into [0.0, 1.0] retrieval confidence S_ret
    if top_act > 1.0:
        ret_conf = round(min(0.98, 0.70 + 0.03 * top_act), 2)
    elif top_exp > 1.0:
        ret_conf = round(min(0.75, 0.50 + 0.03 * top_exp), 2)
    else:
        ret_conf = 0.50

    return {
        "active_matches": [item[0] for item in scored_active if item[1] > 1.0][:top_k],
        "expired_matches": [item[0] for item in scored_expired if item[1] > 1.0][:top_k],
        "top_active_score": top_act,
        "top_expired_score": top_exp,
        "retrieval_confidence": ret_conf,
    }
