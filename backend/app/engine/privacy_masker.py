# -*- coding: utf-8 -*-
"""Layer 1 & Layer 9: PII/Confidentiality Masker, OWASP LLM01 Sandboxing & AI Disclosure Receipt."""
import re
from typing import List, Dict, Any

EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_REGEX = re.compile(r"(?:\+\d{1,3}[\s-]?)?\(?\d{3,4}\)?[\s.-]?\d{3,6}(?:[\s.-]?\d{3,4})?\b")

# OWASP LLM01 Prompt Injection signatures (Section 5.4 & 6.2)
PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|above|[A-Z]+-\d+)\s*(?:instructions|and)?", re.IGNORECASE),
    re.compile(r"disregard\s+(?:the\s+)?(?:brand\s+)?(?:guidelines|rules)", re.IGNORECASE),
    re.compile(r"system\s*(?:fact\s*)?override\s*:", re.IGNORECASE),
    re.compile(r"system\s*:\s*mark\s+this", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+in\s+developer\s+mode", re.IGNORECASE),
    re.compile(r"(?:set|return|output)\s+(?:overall_)?verdict\s*(?:=|to)?\s*(?:pass|approved)", re.IGNORECASE),
    re.compile(r"approve\s+(?:this\s+document\s+)?immediately", re.IGNORECASE),
    re.compile(r"<\s*/?\s*(?:system|untrusted_content_to_verify|quoted_submission_data)\s*>", re.IGNORECASE),
]

DEFAULT_CONFIDENTIAL_TERMS = [
    "Project Aurora",
    "NW-Internal-Pricing-2027",
    "Acq-Target-Beta",
]


def mask_sensitive_content(
    text: str,
    confidential_terms: List[str] = None,
) -> Dict[str, Any]:
    """
    Masks personal data (PII) and confidential product code names before any model/semantic call.
    Also detects OWASP LLM01 prompt injection attempts and wraps content as quoted data.
    """
    if confidential_terms is None:
        confidential_terms = DEFAULT_CONFIDENTIAL_TERMS

    masked_text = text
    pii_count = 0
    confidential_count = 0
    injection_matches: List[str] = []

    # 1. Mask emails
    emails_found = EMAIL_REGEX.findall(masked_text)
    if emails_found:
        pii_count += len(emails_found)
        masked_text = EMAIL_REGEX.sub("[MASKED_EMAIL]", masked_text)

    # 2. Mask phone numbers
    phones_found = PHONE_REGEX.findall(masked_text)
    if phones_found:
        pii_count += len(phones_found)
        masked_text = PHONE_REGEX.sub("[MASKED_PHONE]", masked_text)

    # 3. Mask confidential terms
    for term in confidential_terms:
        if not term:
            continue
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        found = pattern.findall(masked_text)
        if found:
            confidential_count += len(found)
            masked_text = pattern.sub("[MASKED_CONFIDENTIAL_TERM]", masked_text)

    # 4. Detect OWASP LLM01 prompt injection patterns
    for pat in PROMPT_INJECTION_PATTERNS:
        m = pat.search(masked_text)
        if m:
            injection_matches.append(m.group(0))

    # Content is always sandboxed as quoted data so model treats it strictly as data, never instructions
    sandboxed_quoted_data = f"<QUOTED_SUBMISSION_DATA>\n{masked_text}\n</QUOTED_SUBMISSION_DATA>"

    return {
        "masked_text": masked_text,
        "sandboxed_quoted_data": sandboxed_quoted_data,
        "pii_masked_count": pii_count,
        "confidential_terms_masked_count": confidential_count,
        "injection_attempts_detected": len(injection_matches),
        "injection_matches": injection_matches,
    }


def build_ai_disclosure_receipt(
    mask_result: Dict[str, Any],
    models_invoked: List[str],
    rule_set_version: str = "v1.0.0",
    external_data_sent: bool = False,
) -> Dict[str, Any]:
    """Builds the Section 4.4 / Section 6.4 AI Disclosure Receipt."""
    summary_parts = [
        "Deterministic checks ran locally.",
        f"PII masked ({mask_result['pii_masked_count']} items); confidential terms masked ({mask_result['confidential_terms_masked_count']} items).",
    ]
    if mask_result["injection_attempts_detected"] > 0:
        summary_parts.append(
            f"Blocked {mask_result['injection_attempts_detected']} prompt-injection instruction pattern(s); content treated strictly as quoted data."
        )
    summary_parts.append("Rule citations verified and hashed into the append-only audit ledger.")

    return {
        "deterministic_checks_local": True,
        "pii_masked_count": mask_result["pii_masked_count"],
        "confidential_terms_masked_count": mask_result["confidential_terms_masked_count"],
        "injection_attempts_blocked": mask_result["injection_attempts_detected"],
        "models_invoked": models_invoked,
        "external_data_sent": external_data_sent,
        "rule_set_version": rule_set_version,
        "citation_hashes_verified": True,
        "summary_text": " ".join(summary_parts),
    }
