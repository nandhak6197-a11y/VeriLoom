# -*- coding: utf-8 -*-
"""
Acceptance Tests for Round 3 Finalist Innovations (Improvements 1, 2, and 3).

Validates:
  1. Live Enterprise Fact-Graph & Knowledge Sync Engine (extraction, provenance, blast radius, graph)
  2. Multi-Jurisdiction Regulatory Matrix & Smart Legal Disclosures (US FTC, EU AI Act, UK ASA/CMA, non-destructive injection)
  3. Deep Document OCR, Logo Safe-Zone Clearance (0.5x margin) & Cryptographic Audit Certificates
"""
import pytest
from backend.app.engine.knowledge_sync import EnterpriseKnowledgeSyncEngine
from backend.app.engine.regulatory_matrix import (
    evaluate_regulatory_compliance,
    inject_disclosure_into_text,
    list_supported_jurisdictions,
    JURISDICTION_PROFILES,
)
from backend.app.engine.layout_safezone import (
    audit_logo_safe_zone,
    generate_compliance_certificate,
    parse_scanned_pdf_bytes,
)


# =========================================================================
# TEST SUITE 1: Enterprise Fact-Graph & Knowledge Sync Engine (§Round 3 Imp 1)
# =========================================================================

def test_enterprise_fact_extraction_and_provenance():
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")
    doc_text = """
    Enterprise Product Release Q4 2026:
    Northwind Academy discount is 30% for all enterprise partners.
    Data Foundations takes 16 weeks to complete.
    AWS Cohort achieved a 94% job placement rate according to the internal auditor.
    Cohort size is capped at 30 students per session.
    """
    facts = engine.extract_atomic_facts_from_document(
        document_text=doc_text,
        source_title="Q4 2026 Enterprise Release Memo",
        doc_type="confluence",
        effective_year=2026,
    )
    assert len(facts) >= 3

    # Check provenance hashing and time-bounded validity windows
    for f in facts:
        assert f["provenance_hash"] != ""
        assert len(f["provenance_hash"]) == 64
        assert f["valid_from"].startswith("2026-")
        assert f["valid_until"].startswith("2027-") or f["valid_until"].startswith("2026-")
        assert f["tenant"] == "northwind_academy"


def test_queue_blast_radius_impact_evaluation():
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")
    new_facts = [
        {
            "fact_id": "FACT-SYNC-PRICING",
            "subject": "Northwind Academy",
            "predicate": "offers",
            "metric": "30%",
            "statement": "Tuition discount is 30%",
        }
    ]
    pending_assets = [
        {
            "asset_id": "AST-001",
            "title": "Fall Campaign",
            "current_content": "Enroll now and get a 40% discount on tuition!",
        },
        {
            "asset_id": "AST-002",
            "title": "Winter Promo",
            "current_content": "Northwind Academy brings world-class courses to you.",
        },
    ]

    blast = engine.calculate_queue_blast_radius(new_facts, pending_assets)
    assert blast["pending_submissions_analyzed"] == 2
    assert blast["total_new_facts"] == 1
    assert blast["blast_radius_risk"] in ("HIGH", "LOW")
    assert any(a["asset_id"] == "AST-001" for a in blast["impacted_assets"])


def test_knowledge_graph_representation_structure():
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")
    sample_facts = [
        {
            "fact_id": "F-001",
            "subject": "Northwind Academy",
            "predicate": "offers",
            "metric": "30% discount",
            "category": "pricing",
            "status": "ACTIVE",
            "statement": "Tuition discount is 30% for Q4",
        },
        {
            "fact_id": "F-002",
            "subject": "Data Foundations",
            "predicate": "runs for",
            "metric": "16 weeks",
            "category": "curriculum",
            "status": "EXPIRED",
            "statement": "Data Foundations takes 16 weeks",
        },
    ]
    graph = engine.generate_knowledge_graph_representation(sample_facts)
    assert graph["node_count"] >= 3
    assert graph["edge_count"] >= 2
    # Check node types
    node_types = {n["type"] for n in graph["nodes"]}
    assert "fact" in node_types
    assert "subject" in node_types


# =========================================================================
# TEST SUITE 2: Multi-Jurisdiction Regulatory Matrix (§Round 3 Imp 2)
# =========================================================================

def test_supported_jurisdictions_coverage():
    jurs = list_supported_jurisdictions()
    assert len(jurs) >= 4
    codes = {j["code"] for j in jurs}
    assert "US" in codes
    assert "EU" in codes
    assert "UK" in codes
    assert "GLOBAL" in codes


def test_us_ftc_ai_and_sponsorship_disclosures():
    # US FTC requires [AI-Assisted] when origin is ai_generated and no disclosure exists
    text = "Boost your cloud career with Northwind Academy's world-class curriculum."
    findings_ai = evaluate_regulatory_compliance(
        text=text,
        origin="ai_generated",
        channel="social",
        jurisdiction="US",
    )
    assert any(f["rule_id"] == "REG-US-AI" for f in findings_ai)
    ai_finding = next(f for f in findings_ai if f["rule_id"] == "REG-US-AI")
    assert ai_finding["suggested_disclosure"] == "[AI-Assisted]"

    # US FTC requires #ad or #sponsored when origin is agency
    findings_agency = evaluate_regulatory_compliance(
        text=text,
        origin="agency",
        channel="social",
        jurisdiction="US",
    )
    assert any(f["rule_id"] == "REG-US-SPON" for f in findings_agency)


def test_eu_ai_act_article_50_compliance():
    # EU AI Act Art. 50 mandates explicit notice of AI-generated commercial content
    text = "Join Northwind today and master generative AI with top mentors."
    findings_eu = evaluate_regulatory_compliance(
        text=text,
        origin="ai_generated",
        channel="web",
        jurisdiction="EU",
    )
    assert any(f["rule_id"] == "REG-EU-AI-50" for f in findings_eu)
    eu_finding = next(f for f in findings_eu if f["rule_id"] == "REG-EU-AI-50")
    assert "Article 50" in eu_finding["source_clause"]
    assert "AI-generated" in eu_finding["suggested_disclosure"]


def test_uk_asa_cap_code_substantiation():
    # UK ASA CAP Code requires substantiation notice for placement statistics
    text = "Northwind achieved a 94% job placement rate in 2026."
    findings_uk = evaluate_regulatory_compliance(
        text=text,
        origin="employee",
        channel="web",
        jurisdiction="UK",
    )
    assert any(f["rule_id"] == "REG-UK-SUBST" for f in findings_uk)


def test_non_destructive_disclosure_injection():
    orig_text = "Master Data Science in 16 weeks with Northwind Academy."
    disclosure = "[AI-Assisted]"
    injected = inject_disclosure_into_text(orig_text, disclosure, placement="append")
    # Original text must be strictly preserved intact
    assert orig_text in injected
    assert disclosure in injected
    # Re-injecting should be idempotent
    injected_twice = inject_disclosure_into_text(injected, disclosure, placement="append")
    assert injected_twice == injected


# =========================================================================
# TEST SUITE 3: Layout Safe-Zone Clearance & Audit Certificate (§Round 3 Imp 3)
# =========================================================================

def test_logo_safe_zone_clearance_math():
    # Minimum 0.5x height padding rule: For height=100px, required clearance = 50px
    # Case A: Compliant logo with 60px margin on all sides
    compliant_res = audit_logo_safe_zone(
        image_width=1200,
        image_height=630,
        logo_bbox={"x": 60, "y": 60, "width": 400, "height": 100},
        text_boxes=[{"text": "Headline", "x": 60, "y": 240, "width": 600, "height": 80}],
        min_clearance_ratio=0.5,
    )
    assert compliant_res["passes_safe_zone"] is True
    assert compliant_res["required_padding_px"] == 50
    assert len(compliant_res["edge_violations"]) == 0

    # Case B: Non-compliant logo placed too close to the canvas edge (x=10, y=10)
    non_compliant_res = audit_logo_safe_zone(
        image_width=1200,
        image_height=630,
        logo_bbox={"x": 10, "y": 10, "width": 300, "height": 100},
        text_boxes=[],
        min_clearance_ratio=0.5,
    )
    assert non_compliant_res["passes_safe_zone"] is False
    assert len(non_compliant_res["edge_violations"]) >= 1


def test_logo_safe_zone_text_encroachment():
    # Case: Text box encroaches into the 50px safe-zone boundary
    encroached_res = audit_logo_safe_zone(
        image_width=1200,
        image_height=630,
        logo_bbox={"x": 100, "y": 100, "width": 400, "height": 100},
        text_boxes=[{"text": "Cluttered Tagline", "x": 120, "y": 130, "width": 200, "height": 30}],
        min_clearance_ratio=0.5,
    )
    assert encroached_res["passes_safe_zone"] is False
    assert len(encroached_res["encroaching_elements"]) >= 1


def test_compliance_proof_certificate_generation():
    asset_dict = {
        "asset_id": "AST-P01-PROD",
        "title": "Fall 2026 Admissions Banner",
        "tenant": "northwind_academy",
        "channel": "social",
        "origin": "employee",
        "original_sha256": "abcdef1234567890",
        "current_content": "Certified admissions copy for Northwind Academy.",
    }
    findings = [
        {"finding_id": "F-1", "rule_id": "RULE-PALETTE-01", "verdict_tier": "Advisory", "status": "OPEN"},
        {"finding_id": "F-2", "rule_id": "REG-US-AI", "verdict_tier": "Advisory", "status": "ACCEPTED_FIX", "creator_action": "ACCEPT"},
    ]

    cert = generate_compliance_certificate(
        asset_dict=asset_dict,
        findings=findings,
        signer_name="Nandha K",
        signer_role="Brand Admin",
        jurisdiction="US",
        ledger_block_id=10,
        ledger_block_hash="0000a1b2c3d4e5f6",
    )

    assert cert["certificate_id"].startswith("CERT-VERILOOM-")
    assert cert["jurisdiction"] == "US"
    assert cert["cryptographic_proof"]["audit_ledger_status"] == "CRYPTOGRAPHICALLY_VERIFIED"
    assert len(cert["cryptographic_proof"]["digital_signature_sha256"]) == 64
    assert cert["governance_signoff"]["four_role_rbac_verified"] is True
    assert cert["compliance_summary"]["surgical_fixes_applied"] == 1


def test_structured_json_and_csv_enterprise_fact_sync():
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")

    # JSON Feed
    json_feed = """[
        {"subject": "Northwind Academy", "predicate": "offers", "metric": "35% scholarship", "category": "scholarship"},
        {"subject": "Cloud Architecture", "predicate": "runs for", "metric": "14 weeks", "category": "curriculum"}
    ]"""
    json_facts = engine.extract_atomic_facts_from_document(
        document_text=json_feed,
        source_name="Jira Curriculum Export",
        source_type="jira",
    )
    assert len(json_facts) == 2
    assert any(f["metric"] == "35% scholarship" for f in json_facts)
    assert all(f["provenance_hash"] != "" for f in json_facts)

    # CSV Feed
    csv_feed = """subject,predicate,metric,category
Northwind Enterprise,discount is,25%,pricing
Data Engineering,takes,12 weeks,curriculum"""
    csv_facts = engine.extract_atomic_facts_from_document(
        document_text=csv_feed,
        source_name="Notion CSV Export",
        source_type="notion",
    )
    assert len(csv_facts) == 2
    assert any(f["metric"] == "25%" for f in csv_facts)


def test_scanned_pdf_raster_ocr_fallback():
    import io
    import pymupdf
    from PIL import Image
    from backend.app.engine.ingestion import ingest_document_bytes

    # Create a synthetic raster/scanned image PDF with NO native vector text
    img = Image.new("RGB", (600, 300), color=(255, 255, 255))
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_raw = img_bytes_io.getvalue()

    pdf_doc = pymupdf.open()
    page = pdf_doc.new_page(width=600, height=300)
    page.insert_image(pymupdf.Rect(0, 0, 600, 300), stream=img_raw)
    pdf_bytes = pdf_doc.tobytes()

    ingested = ingest_document_bytes("scanned_brochure.pdf", pdf_bytes)
    assert ingested["content_type"] == "pdf"
    assert ingested["metadata"].get("ocr_raster_fallback") is True
    assert ingested["metadata"].get("embedded_images") >= 1


def test_submission_with_jurisdiction_and_disclosure_application():
    from fastapi.testclient import TestClient
    from backend.app.main import app

    client = TestClient(app)

    # 1. Submit with EU Jurisdiction
    res = client.post("/api/submissions", json={
        "title": "EU Marketing Campaign",
        "content": "Master generative AI with Northwind Academy today.",
        "creator_intent": "Launch EU Campaign",
        "must_keep_points": ["Northwind Academy"],
        "origin": "ai_generated",
        "channel": "web",
        "jurisdiction": "EU",
        "actor_name": "Nandha K",
        "actor_role": "Creator"
    })
    assert res.status_code == 200
    asset_data = res.json()
    assert asset_data["jurisdiction"] == "EU"
    fnds = asset_data["findings"]
    assert any(f["rule_id"] == "REG-EU-AI-50" for f in fnds)

    # 2. 1-Click Apply Disclosure
    apply_res = client.post(f"/api/submissions/{asset_data['asset_id']}/apply-disclosure", json={
        "asset_id": asset_data["asset_id"],
        "rule_id": "REG-EU-AI-50",
        "disclosure_text": "Transparency Notice: Content AI-generated pursuant to EU AI Act Article 50.",
        "placement": "append",
        "actor_name": "Nandha K",
        "actor_role": "Creator"
    })
    assert apply_res.status_code == 200
    updated_data = apply_res.json()
    assert "EU AI Act Article 50" in updated_data["current_content"]
    assert updated_data["normalized_sha256"] != asset_data["normalized_sha256"]


def test_visual_audit_custom_upload_key_mapping():
    """Validates lines 426-433 in submissions.py properly map width, height, and text_boxes from audit_res."""
    import base64
    import io
    from PIL import Image, ImageDraw
    from fastapi.testclient import TestClient
    from backend.app.main import app

    client = TestClient(app)

    # Generate a test image with high-contrast text and custom dimensions (800x400)
    img = Image.new("RGB", (800, 400), color=(15, 43, 72))  # Northwind navy
    draw = ImageDraw.Draw(img)
    # Add text bars that create OCR text boxes
    for x_off in range(60, 700, 20):
        draw.rectangle([x_off, 120, x_off + 10, 160], fill=(248, 250, 252))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")

    res = client.post("/api/submissions/visual-audit", json={
        "mode": "custom_upload",
        "image_base64": f"data:image/png;base64,{b64_str}",
        "filename": "custom_test_banner.png",
    })
    assert res.status_code == 200
    data = res.json()
    assert "safe_zone_audit" in data
    sz = data["safe_zone_audit"]
    # Image width and height must match the uploaded image dimensions (800, 400), not default (1200, 630)
    assert data["width"] == 800
    assert data["height"] == 400
    assert "edge_clearance" in sz
    # Check that logo safe-zone audit received real text boxes
    assert isinstance(data.get("text_boxes"), list)
    assert len(data.get("text_boxes")) >= 1
    assert "required_margin_px" in sz
    assert "clearance_box" in sz
    assert "is_compliant" in sz


def test_certificate_api_download_and_proofs():
    """Validates /api/submissions/{asset_id}/certificate contains dual SHA-256, signature, CIEDE2000, and Merkle proof."""
    from fastapi.testclient import TestClient
    from backend.app.main import app

    client = TestClient(app)

    # 1. Create a submission
    res = client.post("/api/submissions", json={
        "title": "Certificate Proof Verification Asset",
        "content": "Certified corporate communication for Northwind Academy.",
        "creator_intent": "Audited release",
        "must_keep_points": ["Northwind Academy"],
        "origin": "employee",
        "channel": "web",
        "jurisdiction": "US",
        "actor_name": "Auditor Test",
        "actor_role": "Creator"
    })
    assert res.status_code == 200
    asset_id = res.json()["asset_id"]

    # 2. Query certificate JSON
    cert_res = client.get(f"/api/submissions/{asset_id}/certificate?signer_name=Auditor%20One&signer_role=Brand%20Admin")
    assert cert_res.status_code == 200
    cert = cert_res.json()

    # Verify all required proof elements per R3 / AC-API-06
    assert cert["certificate_id"].startswith("CERT-VERILOOM-")
    assert cert["asset_id"] == asset_id
    assert "content_sha256" in cert and len(cert["content_sha256"]) == 64
    assert "report_sha256" in cert and len(cert["report_sha256"]) == 64
    assert cert["cryptographic_proof"]["dual_sha256"]["asset_content_sha256"] == cert["content_sha256"]
    assert cert["cryptographic_proof"]["dual_sha256"]["compliance_report_sha256"] == cert["report_sha256"]
    assert "digital_signature" in cert and len(cert["digital_signature"]) == 64
    assert "ciede2000_proof" in cert
    assert cert["ciede2000_proof"]["status"] == "PASS"
    assert "merkle_root" in cert and len(cert["merkle_root"]) > 0
    assert cert["cryptographic_validity"] is True
    assert "timestamp" in cert
    assert cert["governance_signoff"]["signed_by"] == "Auditor One"
    assert cert["governance_signoff"]["role"] == "Brand Admin"

    # 3. Query certificate with download=true
    dl_res = client.get(f"/api/submissions/{asset_id}/certificate?download=true")
    assert dl_res.status_code == 200
    assert "attachment" in dl_res.headers.get("Content-Disposition", "")
    assert f"certificate-{asset_id}.json" in dl_res.headers.get("Content-Disposition", "")


def test_logo_safe_zone_four_boundary_margins():
    """Validates pixel-level logo safe-zone clearance enforcing minimum 0.5x height padding on all 4 boundaries."""
    # Logo: 200w x 80h -> 0.5x height = 40px required margin on all 4 boundaries
    # Canvas: 1000 x 500

    # Test Left margin violation (x=30 < 40)
    left_fail = audit_logo_safe_zone(
        image_width=1000,
        image_height=500,
        logo_bbox={"x": 30, "y": 50, "width": 200, "height": 80},
    )
    assert left_fail["is_compliant"] is False
    assert any("Left canvas margin" in v for v in left_fail["edge_violations"])

    # Test Top margin violation (y=20 < 40)
    top_fail = audit_logo_safe_zone(
        image_width=1000,
        image_height=500,
        logo_bbox={"x": 50, "y": 20, "width": 200, "height": 80},
    )
    assert top_fail["is_compliant"] is False
    assert any("Top canvas margin" in v for v in top_fail["edge_violations"])

    # Test Right margin violation (x=770, width=200 -> right clearance = 1000 - 970 = 30 < 40)
    right_fail = audit_logo_safe_zone(
        image_width=1000,
        image_height=500,
        logo_bbox={"x": 770, "y": 50, "width": 200, "height": 80},
    )
    assert right_fail["is_compliant"] is False
    assert any("Right canvas margin" in v for v in right_fail["edge_violations"])

    # Test Bottom margin violation (y=400, height=80 -> bottom clearance = 500 - 480 = 20 < 40)
    bottom_fail = audit_logo_safe_zone(
        image_width=1000,
        image_height=500,
        logo_bbox={"x": 50, "y": 400, "width": 200, "height": 80},
    )
    assert bottom_fail["is_compliant"] is False
    assert any("Bottom canvas margin" in v for v in bottom_fail["edge_violations"])

    # Test Compliant logo (x=50, y=50, width=200, height=80 -> all clearances >= 40)
    pass_res = audit_logo_safe_zone(
        image_width=1000,
        image_height=500,
        logo_bbox={"x": 50, "y": 50, "width": 200, "height": 80},
    )
    assert pass_res["is_compliant"] is True
    assert pass_res["passes_safe_zone"] is True
    assert pass_res["required_margin_px"] == 40.0
    assert len(pass_res["edge_violations"]) == 0
    assert pass_res["encroachment_count"] == 0


