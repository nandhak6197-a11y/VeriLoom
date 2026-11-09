# -*- coding: utf-8 -*-
"""
VeriLoom Round 3 - Milestone 6 (R5) Simulation & Refinement Verification Suite.

Validates the complete quality and resilience cycle:
1. Multi-format sample document ingestion (.docx, .pdf, .txt, .png).
2. Knowledge sync date normalization (non-zero-padded months, invalid date strings).
3. Queue blast-radius conflict detection across multi-dimensional facts.
4. Multi-jurisdiction marketing drafts (US, EU, UK, Global) with non-destructive disclosures.
5. Cumulative channel limit evaluation on character-sparse channels (SMS, Push, Ad).
6. Safe-zone geometric stress tests (extreme aspect ratios, flush boundary touching).
7. Cryptographic certificate gating on APPROVED status & genuine visual proofs.
"""
import io
import json
import hashlib
from datetime import date, datetime, timedelta
import pytest
from fastapi.testclient import TestClient

import docx
import pymupdf
from PIL import Image

from backend.app.main import app, init_db_and_seed
from backend.app.config import DEFAULT_REVIEW_DATE
from backend.app.engine.ingestion import ingest_document_bytes, normalize_text
from backend.app.engine.knowledge_sync import (
    EnterpriseKnowledgeSyncEngine,
    parse_iso_date_safely,
    compute_sha256_text,
)
from backend.app.engine.regulatory_matrix import (
    evaluate_regulatory_compliance,
    inject_disclosure_into_text,
    CHANNEL_LIMITS,
    JURISDICTION_PROFILES,
)
from backend.app.engine.layout_safezone import (
    audit_logo_safe_zone,
    generate_compliance_certificate,
    parse_scanned_pdf_bytes,
)
from backend.app.engine.vision_auditor import generate_test_banner_png

# Initialize database
init_db_and_seed()
client = TestClient(app)


# =============================================================================
# 1. MULTI-FORMAT SAMPLE DOCUMENT INGESTION (.DOCX, .PDF, .TXT, .PNG)
# =============================================================================

def _build_sample_docx(text_paragraphs, table_data=None) -> bytes:
    doc = docx.Document()
    for p in text_paragraphs:
        doc.add_paragraph(p)
    if table_data:
        table = doc.add_table(rows=len(table_data), cols=len(table_data[0]))
        for r_idx, row in enumerate(table_data):
            for c_idx, val in enumerate(row):
                table.cell(r_idx, c_idx).text = str(val)
    bio = io.BytesIO()
    doc.save(bio)
    return bio.getvalue()


def _build_sample_pdf(pages_text: list) -> bytes:
    doc = pymupdf.open()
    for t in pages_text:
        page = doc.new_page()
        page.insert_text((72, 72), t)
    bio = io.BytesIO()
    doc.save(bio)
    return bio.getvalue()


def _build_sample_png(width=800, height=400, color=(11, 26, 44)) -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    bio = io.BytesIO()
    img.save(bio, format="PNG")
    return bio.getvalue()


def test_simulation_sample_document_ingestion_multi_format():
    """Simulates ingestion of random sample documents across .txt, .docx, .pdf, and .png."""
    # 1. Plain text ingestion with unicode & paragraph breaks
    txt_content = "Northwind Academy provides cloud engineering certifications.\n\nAll courses include career coaching."
    txt_bytes = txt_content.encode("utf-8")
    res_txt = ingest_document_bytes("syllabus.txt", txt_bytes)
    assert res_txt["content_type"] == "text"
    assert "Northwind Academy provides" in res_txt["normalized_content"]
    assert len(res_txt["sentences"]) == 2
    assert len(res_txt["original_sha256"]) == 64

    # 2. DOCX ingestion with paragraphs and structured tables
    docx_bytes = _build_sample_docx(
        text_paragraphs=["Executive Summary: Q4 Curriculum", "Enrollment statistics for 2026."],
        table_data=[["Course", "Duration", "Tuition"], ["DevOps Master", "14 weeks", "$3,500"]],
    )
    res_docx = ingest_document_bytes("curriculum.docx", docx_bytes)
    assert res_docx["content_type"] == "docx"
    assert "Executive Summary" in res_docx["normalized_content"]
    assert "DevOps Master | 14 weeks | $3,500" in res_docx["normalized_content"]
    assert res_docx["metadata"]["paragraph_count"] >= 2

    # 3. PDF native text stream ingestion
    pdf_bytes = _build_sample_pdf(["Page 1: Certified AWS Solutions Architect Course.", "Page 2: Exam policies."])
    res_pdf = ingest_document_bytes("syllabus.pdf", pdf_bytes)
    assert res_pdf["content_type"] == "pdf"
    assert "Certified AWS Solutions Architect" in res_pdf["normalized_content"]
    assert res_pdf["metadata"]["page_count"] == 2

    # 4. Binary Image ingestion (PNG)
    png_bytes = _build_sample_png(1200, 630)
    res_png = ingest_document_bytes("marketing_hero.png", png_bytes)
    assert res_png["content_type"] == "image"
    assert res_png["metadata"]["is_binary_image"] is True

    # 5. API Upload endpoint simulation via /api/submissions/upload-file
    upload_res = client.post(
        "/api/submissions/upload-file",
        files={"file": ("promo.docx", io.BytesIO(docx_bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        data={
            "title": "Uploaded Curriculum Document",
            "creator_intent": "Promote DevOps curriculum",
            "must_keep_points": "DevOps Master, 14 weeks",
            "origin": "employee",
            "channel": "web",
            "jurisdiction": "US",
        },
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["status"] in ("IN_MANAGER_REVIEW", "ESCALATED_LEGAL")
    assert "DevOps Master" in upload_data["normalized_content"]
    assert len(upload_data["findings"]) >= 0


def test_simulation_scanned_pdf_raster_ocr_stress():
    """Simulates scanned/raster image PDF without native text streams triggering OCR fallback."""
    # Create a PDF containing an embedded image page but zero text characters
    img_bytes = _build_sample_png(400, 200)
    doc = pymupdf.open()
    page = doc.new_page(width=400, height=200)
    page.insert_image(pymupdf.Rect(0, 0, 400, 200), stream=img_bytes)
    bio = io.BytesIO()
    doc.save(bio)
    scanned_pdf_bytes = bio.getvalue()

    # Ingest document bytes - should engage OCR fallback
    res = ingest_document_bytes("scanned_receipt.pdf", scanned_pdf_bytes)
    assert res["content_type"] == "pdf"
    assert res["metadata"].get("ocr_raster_fallback") is True
    assert res["metadata"]["is_scanned_pdf"] is True
    assert "[Scanned Page 1 Content" in res["normalized_content"]


# =============================================================================
# 2. KNOWLEDGE SYNC DATE NORMALIZATION & ROBUSTNESS
# =============================================================================

def test_simulation_knowledge_sync_date_normalization():
    """
    Simulates enterprise document ingestion containing non-zero-padded dates,
    slash separators, and null strings (Reviewer Observation C remediation).
    """
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")

    # JSON Feed with non-zero-padded date ('2026-9-1') and 'None'
    feed_json = json.dumps([
        {
            "subject": "Cybersecurity Bootcamp",
            "predicate": "discount is",
            "metric": "25%",
            "valid_from": "2026-1-1",
            "valid_until": "2026-9-1",
        },
        {
            "subject": "Data Science Program",
            "predicate": "offers",
            "metric": "40% scholarship",
            "valid_from": "2026/01/15",
            "valid_until": "2027/12/31",
        },
        {
            "subject": "AI Engineering",
            "predicate": "duration is",
            "metric": "18 weeks",
            "valid_until": "None",
        },
    ])

    facts = engine.extract_atomic_facts_from_document(
        document_text=feed_json,
        source_name="Multi-Format Date Ingestion Feed",
        source_type="json",
        effective_year=2026,
    )

    assert len(facts) == 3

    # Check 1: 2026-9-1 standardized to 2026-09-01
    f_cyber = next(f for f in facts if f["subject"] == "Cybersecurity Bootcamp")
    assert f_cyber["valid_from"] == "2026-01-01"
    assert f_cyber["valid_until"] == "2026-09-01"

    # Reference check: against 2026-10-15, 2026-09-01 is EXPIRED (NOT active due to ASCII '9' > '0')
    ref_d = date(2026, 10, 15)
    parsed_vu = parse_iso_date_safely(f_cyber["valid_until"])
    assert parsed_vu < ref_d

    # Check 2: slash format standardized to ISO
    f_ds = next(f for f in facts if f["subject"] == "Data Science Program")
    assert f_ds["valid_from"] == "2026-01-15"
    assert f_ds["valid_until"] == "2027-12-31"
    assert f_ds["status"] == "ACTIVE"

    # Check 3: 'None' string safely handled with default horizon
    f_ai = next(f for f in facts if f["subject"] == "AI Engineering")
    assert f_ai["valid_until"] != "None"
    assert len(f_ai["valid_until"]) == 10


def test_simulation_queue_blast_radius_conflict_detection():
    """Simulates blast-radius conflict detection across duration and pricing discrepancies."""
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")

    # Ingest updated truth: Cloud DevOps duration is 14 weeks, discount is 20%
    new_facts = [
        {
            "fact_id": "F-SYNC-01",
            "subject": "Cloud DevOps",
            "category": "curriculum",
            "metric": "14 weeks",
            "status": "ACTIVE",
        },
        {
            "fact_id": "F-SYNC-02",
            "subject": "Northwind Academy",
            "category": "pricing",
            "metric": "20%",
            "status": "ACTIVE",
        },
    ]

    # Pending submissions in queue
    pending = [
        {
            "asset_id": "AST-CONFLICT-1",
            "title": "Outdated Duration Ad",
            "current_content": "Complete our Cloud DevOps certification in just 10 weeks!",
        },
        {
            "asset_id": "AST-CONFLICT-2",
            "title": "Inflated Discount Ad",
            "current_content": "Save 50% discount on all tuition this quarter.",
        },
        {
            "asset_id": "AST-ALIGNED",
            "title": "Accurate Promo",
            "current_content": "Cloud DevOps takes 14 weeks with 20% savings.",
        },
    ]

    res = engine.calculate_queue_blast_radius(new_facts, pending)
    assert res["blast_radius_risk"] == "HIGH"
    assert res["impacted_assets_count"] == 3

    # Verify conflict types
    conflicts = {a["asset_id"]: a for a in res["impacted_assets"]}
    assert conflicts["AST-CONFLICT-1"]["action_required"] == "RE_VERIFY"
    assert conflicts["AST-CONFLICT-1"]["conflicts"][0]["type"] == "DURATION_MISMATCH"

    assert conflicts["AST-CONFLICT-2"]["action_required"] == "RE_VERIFY"
    assert conflicts["AST-CONFLICT-2"]["conflicts"][0]["type"] == "DISCOUNT_MISMATCH"

    assert conflicts["AST-ALIGNED"]["action_required"] == "AUTO_CONFIRM"


# =============================================================================
# 3. MULTI-JURISDICTION CROSS-BORDER MARKETING DRAFTS
# =============================================================================

def test_simulation_multi_jurisdiction_cross_border_drafts():
    """Simulates marketing drafts across US, EU, and UK jurisdictions with statutory disclosures."""
    # US FTC Simulation: AI generated copy requires [AI-Assisted] disclosure
    us_draft = "Accelerate your cloud architecture career with Northwind Academy today."
    us_findings = evaluate_regulatory_compliance(us_draft, origin="ai_generated", channel="social", jurisdiction="US")
    assert any(f["rule_id"] == "REG-US-AI" for f in us_findings)

    # EU AI Act Art 50 Simulation: AI generated copy requires explicit synthetic media label
    eu_findings = evaluate_regulatory_compliance(us_draft, origin="ai_generated", channel="social", jurisdiction="EU")
    assert any(f["rule_id"] == "REG-EU-AI-50" for f in eu_findings)
    assert any("Article 50" in f["source_clause"] for f in eu_findings)

    # UK ASA / CMA Simulation: APR credit claim requires representative financing disclaimer
    uk_credit_draft = "Pay in monthly installments for the Cloud Engineering bootcamp."
    uk_findings = evaluate_regulatory_compliance(uk_credit_draft, origin="employee", channel="web", jurisdiction="UK")
    assert any(f["rule_id"] == "REG-UK-APR" for f in uk_findings)
    assert any("CAP Code" in f["source_clause"] for f in uk_findings)

    # Global Harmonized Simulation: All applicable rules evaluate simultaneously
    global_findings = evaluate_regulatory_compliance(uk_credit_draft, origin="ai_generated", channel="web", jurisdiction="GLOBAL")
    rule_ids = {f["rule_id"] for f in global_findings}
    assert "REG-US-AI" in rule_ids
    assert "REG-EU-AI-50" in rule_ids
    assert "REG-UK-APR" in rule_ids


# =============================================================================
# 4. CUMULATIVE CHANNEL CAPACITY & EXTENDED CHANNEL LIMITS (SMS / PUSH)
# =============================================================================

def test_simulation_cumulative_channel_capacity_and_sparse_limits():
    """
    Simulates cumulative character capacity analysis on character-sparse channels
    (SMS: 160, Push: 100, Ad: 150) across co-occurring disclosures (Reviewer Observation D remediation).
    """
    # 1. Verify extended channel limits are registered
    assert CHANNEL_LIMITS["sms"] == 160
    assert CHANNEL_LIMITS["push"] == 100
    assert CHANNEL_LIMITS["ad"] == 150

    # 2. Draft triggering 2 co-occurring disclosures: AI Origin + Credit Terms
    # Headline: 90 chars. On 'ad' (150 chars limit):
    # Disclosure 1 (AI label): 14 chars -> total 105 chars (fits)
    # Disclosure 2 (APR terms): 55 chars -> cumulative total 105 + 56 = 161 chars (exceeds 150 limit!)
    draft = "Pay in monthly installments for Northwind Academy Cloud Architecture certification courses."
    assert len(draft) >= 80

    findings = evaluate_regulatory_compliance(
        text=draft,
        origin="ai_generated",
        channel="ad",
        jurisdiction="GLOBAL",
    )

    # First finding should report cumulative fit
    f1 = findings[0]
    assert f1["channel_char_limit"] == 150

    # Subsequent co-occurring findings must reflect cumulative disclosure overhead
    assert any(f.get("cumulative_disclosure_length", 0) > 0 for f in findings)
    assert any(f["fits_in_channel"] is False for f in findings)

    # 3. On 'push' channel (100 limit): base text of 85 chars + disclosure of 20 chars overflows
    push_findings = evaluate_regulatory_compliance(
        text=draft,
        origin="ai_generated",
        channel="push",
        jurisdiction="US",
    )
    assert push_findings[0]["channel_char_limit"] == 100
    assert push_findings[0]["fits_in_channel"] is False


# =============================================================================
# 5. LOGO SAFE-ZONE GEOMETRIC STRESS & BOUNDARY TOUCHING
# =============================================================================

def test_simulation_safe_zone_extreme_aspect_ratios_and_boundary_flush():
    """
    Stress-tests logo safe-zone geometry:
    - Extreme aspect ratios (ultra-wide 10:1, ultra-tall 1:5, square 1:1).
    - Text boxes flush against safe-zone perimeter (Reviewer Observation B remediation).
    """
    # 1. Ultra-wide logo: 1000w x 100h -> required padding = 50px (0.5x height)
    # Safe zone for logo at (100, 100): x1=50, y1=50, x2=1150, y2=250
    # Text box T_LEFT spanning [0, 50]: exactly touches safe_x1 (50) without penetrating
    res_wide = audit_logo_safe_zone(
        image_width=1600,
        image_height=600,
        logo_bbox={"x": 100, "y": 100, "width": 1000, "height": 100},
        text_boxes=[
            {"box_id": "T_LEFT", "x": 0, "y": 80, "width": 50, "height": 40},      # tx + tw == safe_x1 (50 == 50)
            {"box_id": "T_RIGHT", "x": 1150, "y": 80, "width": 100, "height": 40},  # tx == safe_x2 (1150 == 1150)
            {"box_id": "T_TOP", "x": 200, "y": 0, "width": 200, "height": 50},       # ty + th == safe_y1 (50 == 50)
            {"box_id": "T_BOTTOM", "x": 200, "y": 250, "width": 200, "height": 50},  # ty == safe_y2 (250 == 250)
        ],
        min_clearance_ratio=0.5,
    )
    assert res_wide["passes_safe_zone"] is True
    assert len(res_wide["encroaching_elements"]) == 0

    # 2. Text box penetrating by 1px into the safe zone MUST be flagged
    res_encroach = audit_logo_safe_zone(
        image_width=1600,
        image_height=600,
        logo_bbox={"x": 100, "y": 100, "width": 1000, "height": 100},
        text_boxes=[
            {"box_id": "T_ENCROACH", "x": 0, "y": 80, "width": 51, "height": 40},  # tx + tw == 51 > safe_x1 (50)
        ],
        min_clearance_ratio=0.5,
    )
    assert res_encroach["passes_safe_zone"] is False
    assert len(res_encroach["encroaching_elements"]) == 1
    assert res_encroach["encroaching_elements"][0]["box_id"] == "T_ENCROACH"

    # 3. Ultra-tall vertical logo: 60w x 300h -> required padding = 150px
    res_tall = audit_logo_safe_zone(
        image_width=1200,
        image_height=800,
        logo_bbox={"x": 200, "y": 200, "width": 60, "height": 300},
        text_boxes=[{"box_id": "T1", "x": 500, "y": 200, "width": 200, "height": 50}],
        min_clearance_ratio=0.5,
    )
    assert res_tall["passes_safe_zone"] is True
    assert res_tall["required_margin_px"] == 150.0

    # 4. Edge-of-canvas clipping violation: logo at (10, 10) violates 50px required margin
    res_edge = audit_logo_safe_zone(
        image_width=1200,
        image_height=600,
        logo_bbox={"x": 10, "y": 10, "width": 200, "height": 100},
        text_boxes=[],
        min_clearance_ratio=0.5,
    )
    assert res_edge["passes_safe_zone"] is False
    assert len(res_edge["edge_violations"]) >= 2


# =============================================================================
# 6. CERTIFICATE GATE & GENUINE VISUAL ATTESTATIONS
# =============================================================================

def test_simulation_certificate_gating_and_genuine_proofs():
    """
    Simulates certificate generation workflow:
    - Unapproved submission querying /certificate returns HTTP 400 Bad Request.
    - Approved submission returns signed certificate with dual SHA-256 and Merkle hash.
    - Text-only asset sets ciede2000_proof["status"] = "NOT_APPLICABLE".
    - Downloadable export via ?download=true sets Content-Disposition attachment.
    (Reviewer Observation A remediation).
    """
    # Step 1: Create a submission (status defaults to IN_MANAGER_REVIEW)
    create_res = client.post("/api/submissions", json={
        "title": "Simulation Certificate Gating Verification",
        "content": "Certified Enterprise Cloud Engineering curriculum by Northwind Academy.",
        "creator_intent": "Validate cryptographic signoff gating",
        "must_keep_points": ["Northwind Academy"],
        "origin": "employee",
        "channel": "web",
        "jurisdiction": "US",
        "actor_name": "Test Engineer",
        "actor_role": "Creator",
    })
    assert create_res.status_code == 200
    asset_id = create_res.json()["asset_id"]
    assert create_res.json()["status"] in ("IN_MANAGER_REVIEW", "ESCALATED_LEGAL")

    # Step 2: Query certificate BEFORE approval -> MUST fail with HTTP 400 Bad Request
    unapp_res = client.get(f"/api/submissions/{asset_id}/certificate?signer_name=Auditor&signer_role=Brand%20Admin")
    assert unapp_res.status_code == 400
    assert "APPROVED" in unapp_res.json()["detail"]

    # Step 3: Approve asset through four-role RBAC workflow
    approve_res = client.post("/api/workflow/approve", json={
        "asset_id": asset_id,
        "decision": "APPROVE",
        "actor_name": "Nandha K",
        "actor_role": "Brand Admin",
    })
    assert approve_res.status_code == 200
    assert approve_res.json()["asset_status"] == "APPROVED"

    # Step 4: Query certificate AFTER approval -> MUST succeed with HTTP 200
    cert_res = client.get(f"/api/submissions/{asset_id}/certificate?signer_name=Nandha+K&signer_role=Brand+Admin")
    assert cert_res.status_code == 200
    cert = cert_res.json()

    # Step 5: Verify cryptographic integrity and dual SHA-256 digests
    assert cert["certificate_id"].startswith("CERT-VERILOOM-")
    assert cert["asset_id"] == asset_id
    assert len(cert["content_sha256"]) == 64
    assert len(cert["report_sha256"]) == 64
    assert len(cert["digital_signature"]) == 64
    assert len(cert["merkle_root"]) > 0

    # Step 6: Verify genuine governance signoff and text-only visual proof status
    assert cert["governance_signoff"]["status"] == "APPROVED"
    assert cert["governance_signoff"]["signed_by"] == "Nandha K"
    assert cert["ciede2000_proof"]["status"] == "NOT_APPLICABLE"
    assert cert["compliance_summary"]["wcag_21_contrast_aa_pass"] == "NOT_APPLICABLE"
    assert cert["compliance_summary"]["logo_safe_zone_pass"] == "NOT_APPLICABLE"

    # Step 7: Verify downloadable export format
    dl_res = client.get(f"/api/submissions/{asset_id}/certificate?download=true")
    assert dl_res.status_code == 200
    assert "attachment" in dl_res.headers.get("Content-Disposition", "")
    assert f"certificate-{asset_id}.json" in dl_res.headers.get("Content-Disposition", "")
