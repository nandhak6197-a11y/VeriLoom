# -*- coding: utf-8 -*-
"""
Verification Test Suite for Milestone M2:
Multi-Jurisdiction Regulatory Matrix & Smart Legal Disclosures (§Round 3).

Validates:
  1. AssetModel jurisdiction column persistence
  2. Submission schemas (SubmissionCreateSchema, SubmissionResponseSchema)
  3. All 4 jurisdiction profiles (US FTC, EU AI Act Art. 50, UK ASA/CMA, Global)
  4. Detection of missing mandatory disclosures (AI origin labels, sponsorship tags, APR terms, validity windows)
  5. Channel character limit evaluation (social: 280, ad: 150, email: 2000, web: 5000)
  6. Non-destructive smart disclosure synthesis across placements (append, prepend, footnote) and idempotency
  7. Pipeline Step 4B execution with jurisdiction and channel routing
"""
import pytest
from backend.app.models.asset import AssetModel
from backend.app.schemas.submission import (
    SubmissionCreateSchema,
    SubmissionResponseSchema,
    RegulatoryDisclosureApplySchema,
    RegulatoryFindingDetailSchema,
)
from backend.app.engine.regulatory_matrix import (
    evaluate_regulatory_compliance,
    inject_disclosure_into_text,
    list_supported_jurisdictions,
    CHANNEL_LIMITS,
    JURISDICTION_PROFILES,
)
from backend.app.engine.pipeline import run_full_verification_pipeline


# =========================================================================
# 1. Database Model & Schema Verification
# =========================================================================

def test_jurisdiction_persistence_in_asset_model():
    """Validates that jurisdiction is permanently declared and defaulted on AssetModel."""
    assert hasattr(AssetModel, "jurisdiction")
    col = getattr(AssetModel, "jurisdiction")
    assert col.default.arg == "US"
    assert col.type.length == 32


def test_submission_schemas_jurisdiction_representation():
    """Validates that jurisdiction is properly represented in input and output schemas."""
    # Input schema
    create_schema = SubmissionCreateSchema(
        title="Cross-Border Ad",
        content="Join Northwind Academy today.",
        jurisdiction="EU",
    )
    assert create_schema.jurisdiction == "EU"

    # Default value
    default_schema = SubmissionCreateSchema(
        title="Default Ad",
        content="Join Northwind Academy today.",
    )
    assert default_schema.jurisdiction == "US"

    # Output schema
    response_schema = SubmissionResponseSchema(
        asset_id="AST-M2-001",
        title="Audited Copy",
        raw_content="Text",
        normalized_content="Text",
        current_content="Text",
        created_at="2026-11-09T00:00:00Z",
        original_sha256="abc",
        normalized_sha256="abc",
        jurisdiction="UK",
    )
    assert response_schema.jurisdiction == "UK"

    # Regulatory Apply Schema
    apply_schema = RegulatoryDisclosureApplySchema(
        asset_id="AST-M2-001",
        rule_id="REG-EU-AI-50",
        disclosure_text="[AI-Generated]",
        placement="footnote",
    )
    assert apply_schema.placement == "footnote"


# =========================================================================
# 2. Four Jurisdiction Profiles Coverage
# =========================================================================

def test_all_four_jurisdictions_registered():
    """Validates that US, EU, UK, and Global regimes are registered with complete profiles."""
    jurs = list_supported_jurisdictions()
    assert len(jurs) >= 4
    by_code = {j["code"]: j for j in jurs}

    for code in ("US", "EU", "UK", "GLOBAL"):
        assert code in by_code
        assert by_code[code]["rule_count"] >= 3
        assert len(by_code[code]["statutes"]) >= 2
        assert by_code[code]["flag"] != ""


# =========================================================================
# 3. Detection of Missing Mandatory Disclosures
# =========================================================================

def test_ai_origin_label_detection_across_jurisdictions():
    """Validates missing AI origin labels across US, EU, UK, and Global."""
    unlabelled_copy = "Master advanced machine learning techniques with Northwind."

    # US: Advisory
    f_us = evaluate_regulatory_compliance(unlabelled_copy, origin="ai_generated", channel="social", jurisdiction="US")
    assert any(f["rule_id"] == "REG-US-AI" and f["verdict_tier"] == "Advisory" for f in f_us)

    # EU: Hard statutory Violation under EU AI Act Art. 50
    f_eu = evaluate_regulatory_compliance(unlabelled_copy, origin="ai_generated", channel="web", jurisdiction="EU")
    assert any(f["rule_id"] == "REG-EU-AI-50" and f["verdict_tier"] == "Violation" for f in f_eu)

    # UK: Advisory under ASA synthetic guidance
    f_uk = evaluate_regulatory_compliance(unlabelled_copy, origin="ai_generated", channel="email", jurisdiction="UK")
    assert any(f["rule_id"] == "REG-UK-AI" for f in f_uk)

    # Global: Contains EU AI Act Art. 50
    f_global = evaluate_regulatory_compliance(unlabelled_copy, origin="ai_generated", channel="social", jurisdiction="GLOBAL")
    assert any(f["rule_id"] == "REG-EU-AI-50" for f in f_global)

    # Compliant copy should NOT trigger AI violation
    disclosed_copy = "Master advanced machine learning techniques with Northwind. [AI-Assisted]"
    f_us_clean = evaluate_regulatory_compliance(disclosed_copy, origin="ai_generated", channel="social", jurisdiction="US")
    assert not any(f["rule_id"] == "REG-US-AI" for f in f_us_clean)


def test_sponsorship_tags_detection_across_jurisdictions():
    """Validates missing sponsorship notice when commercial copy originates from an agency."""
    unsponsored_copy = "Northwind Academy has launched an incredible new program."

    # US FTC
    f_us = evaluate_regulatory_compliance(unsponsored_copy, origin="agency", channel="social", jurisdiction="US")
    assert any(f["rule_id"] == "REG-US-SPON" and f["verdict_tier"] == "Violation" for f in f_us)

    # UK CAP Code
    f_uk = evaluate_regulatory_compliance(unsponsored_copy, origin="agency", channel="social", jurisdiction="UK")
    assert any(f["rule_id"] == "REG-UK-SPON" for f in f_uk)

    # EU Commercial Communication
    f_eu = evaluate_regulatory_compliance(unsponsored_copy, origin="agency", channel="social", jurisdiction="EU")
    assert any(f["rule_id"] == "REG-EU-SPON" for f in f_eu)

    # Clean copy with #ad should pass
    sponsored_copy = "Northwind Academy has launched an incredible new program. #Ad #Sponsored"
    f_us_clean = evaluate_regulatory_compliance(sponsored_copy, origin="agency", channel="social", jurisdiction="US")
    assert not any(f["rule_id"] == "REG-US-SPON" for f in f_us_clean)


def test_apr_terms_mandatory_disclosure_detection():
    """Validates detection of missing APR terms when financing or installments are advertised."""
    financing_copy = "Enrol in Data Engineering with 0% financing and monthly payments of $199/month."

    # US TILA / Regulation Z
    f_us = evaluate_regulatory_compliance(financing_copy, origin="employee", channel="web", jurisdiction="US")
    assert any(f["rule_id"] == "REG-US-APR" and f["verdict_tier"] == "Violation" for f in f_us)
    apr_fnd = next(f for f in f_us if f["rule_id"] == "REG-US-APR")
    assert "Truth in Lending" in apr_fnd["source_clause"]
    assert "0% APR" in apr_fnd["suggested_disclosure"]

    # UK Consumer Credit Act / CAP Code Rule 14
    f_uk = evaluate_regulatory_compliance(financing_copy, origin="employee", channel="web", jurisdiction="UK")
    assert any(f["rule_id"] == "REG-UK-APR" and f["verdict_tier"] == "Violation" for f in f_uk)

    # EU Consumer Credit Directive
    f_eu = evaluate_regulatory_compliance(financing_copy, origin="employee", channel="web", jurisdiction="EU")
    assert any(f["rule_id"] == "REG-EU-APR" and f["verdict_tier"] == "Violation" for f in f_eu)

    # Disclosed copy with APR terms should pass
    clean_financing = "Enrol in Data Engineering with 0% financing. *0.0% APR representative. Subject to credit approval."
    f_clean = evaluate_regulatory_compliance(clean_financing, origin="employee", channel="web", jurisdiction="US")
    assert not any(f["rule_id"] == "REG-US-APR" for f in f_clean)


def test_validity_windows_promotional_disclosure_detection():
    """Validates detection of missing promotional validity windows / expiration dates."""
    promo_copy = "Special promotional offer: Save 40% discount on all cloud certification tracks!"

    # US FTC Guides Against Deceptive Pricing
    f_us = evaluate_regulatory_compliance(promo_copy, origin="employee", channel="social", jurisdiction="US")
    assert any(f["rule_id"] == "REG-US-VALID" for f in f_us)

    # EU Price Indication Directive
    f_eu = evaluate_regulatory_compliance(promo_copy, origin="employee", channel="social", jurisdiction="EU")
    assert any(f["rule_id"] == "REG-EU-VALID" and f["verdict_tier"] == "Violation" for f in f_eu)

    # UK CAP Code Rule 8.17 (Promotional Closing Dates)
    f_uk = evaluate_regulatory_compliance(promo_copy, origin="employee", channel="social", jurisdiction="UK")
    assert any(f["rule_id"] == "REG-UK-VALID" and f["verdict_tier"] == "Violation" for f in f_uk)

    # Promo with explicit validity window passes
    dated_promo = "Special promotional offer: Save 40% discount on all cloud tracks! Offer valid until 31 Dec 2026."
    f_clean = evaluate_regulatory_compliance(dated_promo, origin="employee", channel="social", jurisdiction="US")
    assert not any(f["rule_id"] == "REG-US-VALID" for f in f_clean)


# =========================================================================
# 4. Smart Legal Disclosure Synthesizer & Channel Limits
# =========================================================================

def test_channel_character_limits_and_capacity_analyzer():
    """Validates channel capacity limits: social (280), ad (150), email (2000), web (5000)."""
    assert CHANNEL_LIMITS["social"] == 280
    assert CHANNEL_LIMITS["ad"] == 150
    assert CHANNEL_LIMITS["email"] == 2000
    assert CHANNEL_LIMITS["web"] == 5000

    # Test short copy in 'ad' channel (150 limit)
    ad_copy = "Learn Python today."
    f_ad = evaluate_regulatory_compliance(ad_copy, origin="ai_generated", channel="ad", jurisdiction="US")
    assert len(f_ad) >= 1
    fnd = f_ad[0]
    assert fnd["channel_char_limit"] == 150
    assert fnd["fits_in_channel"] is True

    # Test copy that exceeds 'ad' limit (150 chars)
    long_ad_copy = "x" * 140
    f_long_ad = evaluate_regulatory_compliance(long_ad_copy, origin="ai_generated", channel="ad", jurisdiction="US")
    assert f_long_ad[0]["fits_in_channel"] is False

    # Test copy in 'web' channel (5000 limit)
    f_web = evaluate_regulatory_compliance(ad_copy, origin="ai_generated", channel="web", jurisdiction="US")
    assert f_web[0]["channel_char_limit"] == 5000
    assert f_web[0]["fits_in_channel"] is True


def test_smart_disclosure_synthesis_placements():
    """Validates non-destructive synthesis for placements: append, prepend, footnote, and idempotency."""
    headline = "Accelerate your tech career with Northwind Academy."
    disclosure = "[AI-Assisted]"

    # Append
    appended = inject_disclosure_into_text(headline, disclosure, placement="append")
    assert headline in appended
    assert disclosure in appended
    assert appended == f"{headline} {disclosure}"

    # Multiline Append
    multiline_head = "Headline Title\nBody paragraph text."
    appended_multi = inject_disclosure_into_text(multiline_head, disclosure, placement="append")
    assert appended_multi == f"{multiline_head}\n\n{disclosure}"

    # Prepend
    prepended = inject_disclosure_into_text(headline, disclosure, placement="prepend")
    assert prepended == f"{disclosure}\n\n{headline}"

    # Footnote
    footnoted = inject_disclosure_into_text(headline, disclosure, placement="footnote")
    assert footnoted == f"{headline}\n\n---\n{disclosure}"

    # Idempotency: Re-applying must leave the text completely untouched
    re_appended = inject_disclosure_into_text(appended, disclosure, placement="append")
    assert re_appended == appended

    re_footnoted = inject_disclosure_into_text(footnoted, disclosure, placement="footnote")
    assert re_footnoted == footnoted


# =========================================================================
# 5. Pipeline Step 4B Integration
# =========================================================================

def test_pipeline_step_4b_multi_jurisdiction_evaluation():
    """Validates that pipeline Step 4B executes multi-jurisdiction compliance evaluation."""
    rules = []
    facts = []

    # 1. Pipeline evaluation with EU jurisdiction & AI origin triggers hard statutory VIOLATION
    eu_draft = "Master generative AI models with our industry mentors."
    res_eu = run_full_verification_pipeline(
        text=eu_draft,
        rules=rules,
        facts=facts,
        origin="ai_generated",
        channel="web",
        jurisdiction="EU",
    )
    assert res_eu["jurisdiction"] == "EU"
    assert res_eu["overall_verdict"] == "VIOLATION"
    reg_fnd = next(f for f in res_eu["findings"] if f["rule_id"] == "REG-EU-AI-50")
    assert reg_fnd["must_keep_preserved"] is True
    assert reg_fnd["ipm_score"] == 1.0
    assert "EU AI Act Article 50" in reg_fnd["suggested_fix"]

    # 2. Pipeline evaluation with US jurisdiction: AI is Advisory -> overall verdict ADVISORY
    res_us = run_full_verification_pipeline(
        text=eu_draft,
        rules=rules,
        facts=facts,
        origin="ai_generated",
        channel="social",
        jurisdiction="US",
    )
    assert res_us["jurisdiction"] == "US"
    assert res_us["overall_verdict"] == "ADVISORY"
    assert any(f["rule_id"] == "REG-US-AI" for f in res_us["findings"])

    # 3. Pipeline evaluation with UK jurisdiction & financing terms -> triggers REG-UK-APR Violation
    finance_draft = "0% financing available on all Northwind tech courses. Split the cost into monthly instalments."
    res_uk = run_full_verification_pipeline(
        text=finance_draft,
        rules=rules,
        facts=facts,
        origin="employee",
        channel="web",
        jurisdiction="UK",
    )
    assert res_uk["overall_verdict"] == "VIOLATION"
    assert any(f["rule_id"] == "REG-UK-APR" for f in res_uk["findings"])
