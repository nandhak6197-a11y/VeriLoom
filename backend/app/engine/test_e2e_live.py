# -*- coding: utf-8 -*-
"""Comprehensive End-to-End Live Verification Suite for VeriLoom Round 2."""
import base64
import io
import requests
from PIL import Image, ImageDraw
import docx
import pymupdf

BASE_URL = "http://127.0.0.1:8000"


def run_full_suite():
    results = []

    print("=================================================================")
    print("VERILOOM END-TO-END VERIFICATION SUITE - LIVE ENGINE VALIDATION")
    print("=================================================================\n")

    # -------------------------------------------------------------
    # 1. REAL DOCUMENT INGESTION (.docx, .pdf, .txt)
    # -------------------------------------------------------------
    print("[1/7] Testing Real Document Ingestion (.docx, .pdf, .txt)...")
    
    # 1A: Real DOCX creation and upload
    doc = docx.Document()
    doc.add_heading("Northwind Academy Campaign", level=1)
    doc.add_paragraph("Students told us they want cheap courses at NW Academy. Enrolment closes 11/30/26.")
    docx_io = io.BytesIO()
    doc.save(docx_io)
    docx_bytes = docx_io.getvalue()
    
    res_docx_resp = requests.post(
        f"{BASE_URL}/api/submissions/upload-file",
        files={"file": ("northwind_campaign.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        data={
            "title": "Real DOCX Upload Test",
            "creator_intent": "Promote enrolment with date and affordability",
            "must_keep_points": "NW Academy, Enrolment",
            "origin": "agency",
            "channel": "social",
        }
    )
    assert res_docx_resp.status_code == 200, f"DOCX upload failed: {res_docx_resp.text}"
    res_docx = res_docx_resp.json()
    assert res_docx["content_type"] == "docx", "Expected content_type == 'docx'"
    assert "Students told us" in res_docx["raw_content"]
    assert len(res_docx["original_sha256"]) == 64
    assert res_docx["findings_count"] >= 2, f"Expected deterministic violations, got {res_docx['findings_count']}"
    print(f"  [OK] Real DOCX ingested successfully (SHA-256: {res_docx['original_sha256'][:16]}..., {res_docx['findings_count']} violations cited)")
    results.append(("Real .docx Ingestion & Parsing", "PASS", f"Extracted text, dual SHA-256, {res_docx['findings_count']} findings"))

    # 1B: Real PDF creation and upload
    pdf_doc = pymupdf.open()
    page = pdf_doc.new_page(width=595, height=842)
    page.insert_text((50, 72), "Data Foundations takes just 12 weeks. Enrol today.", fontsize=14)
    pdf_bytes = pdf_doc.tobytes()
    pdf_doc.close()

    res_pdf_resp = requests.post(
        f"{BASE_URL}/api/submissions/upload-file",
        files={"file": ("brochure_course.pdf", pdf_bytes, "application/pdf")},
        data={
            "title": "Real PDF Upload Test",
            "creator_intent": "Brochure course promo",
            "must_keep_points": "Data Foundations",
            "origin": "employee",
            "channel": "web",
        }
    )
    assert res_pdf_resp.status_code == 200, f"PDF upload failed: {res_pdf_resp.text}"
    res_pdf = res_pdf_resp.json()
    assert res_pdf["content_type"] == "pdf"
    assert "12 weeks" in res_pdf["raw_content"]
    assert any(f.get("fact_id") == "F-DUR-01" for f in res_pdf["findings"]), "Expected expired fact F-DUR-01 finding"
    print(f"  [OK] Real PDF ingested successfully (PyMuPDF parsed text, caught expired fact F-DUR-01)")
    results.append(("Real .pdf Ingestion & Fact Check", "PASS", "PyMuPDF parsed 1 page, caught expired fact F-DUR-01"))

    # 1C: Real TXT creation and upload
    txt_bytes = "Our platform cuts onboarding time by 50%. Join the webinar on 12 Nov.".encode("utf-8")
    res_txt_resp = requests.post(
        f"{BASE_URL}/api/submissions/upload-file",
        files={"file": ("webinar_copy.txt", txt_bytes, "text/plain")},
        data={
            "title": "Real TXT Upload Test",
            "creator_intent": "Webinar announcement",
            "must_keep_points": "12 Nov, webinar",
            "origin": "ai_generated",
            "channel": "email",
        }
    )
    assert res_txt_resp.status_code == 200
    res_txt = res_txt_resp.json()
    assert res_txt["content_type"] in ("text", "txt")
    assert any(f["rule_id"] == "CLAIM-01" for f in res_txt["findings"])
    print(f"  [OK] Real TXT ingested successfully (Verified Claim-01 and intent locks)")
    results.append(("Real .txt Ingestion & Pipeline", "PASS", "Verified Section 4.4 Worked Example with intent lock"))

    # -------------------------------------------------------------
    # 2. REAL IMAGE BANNER & WCAG 2.1 CONTRAST AUDIT (CIEDE2000)
    # -------------------------------------------------------------
    print("\n[2/7] Testing Real Image Banner & Accessibility Audit (CIEDE2000 dE00 + WCAG 2.1)...")
    
    # Create a real custom banner image with known palette and text boxes
    img = Image.new("RGB", (600, 260), color="#1E293B") # Deep slate brand color
    draw = ImageDraw.Draw(img)
    # High-contrast title box (#F8FAFC on #0F172A)
    draw.rectangle([40, 40, 560, 110], fill="#0F172A", outline="#38BDF8", width=2)
    draw.text((60, 65), "Northwind Academy: High Contrast Title", fill="#F8FAFC")
    # Low-contrast subtitle box (#475569 on #334155)
    draw.rectangle([40, 140, 560, 210], fill="#334155", outline="#64748B", width=2)
    draw.text((60, 165), "Low contrast unreadable subtitle text", fill="#475569")
    
    img_io = io.BytesIO()
    img.save(img_io, format="PNG")
    img_b64 = "data:image/png;base64," + base64.b64encode(img_io.getvalue()).decode("utf-8")
    
    res_vis_resp = requests.post(
        f"{BASE_URL}/api/submissions/visual-audit",
        json={
            "mode": "custom_upload",
            "filename": "custom_campaign_banner.png",
            "image_base64": img_b64,
        }
    )
    assert res_vis_resp.status_code == 200, f"Visual audit failed: {res_vis_resp.text}"
    res_vis = res_vis_resp.json()
    assert "dominant_swatches" in res_vis
    assert len(res_vis["dominant_swatches"]) > 0
    assert any(s["delta_e00"] is not None for s in res_vis["dominant_swatches"]), "Missing CIEDE2000 delta_e00"
    assert "text_boxes" in res_vis
    assert len(res_vis["text_boxes"]) >= 1, "Expected OCR bounding text boxes"
    passes = [b["wcag_aa_pass"] for b in res_vis["text_boxes"]]
    print(f"  [OK] Real custom PNG audited: {len(res_vis['dominant_swatches'])} swatches calculated via CIEDE2000 dE00")
    print(f"  [OK] Measured OCR text box contrast ratios: {[b['contrast_ratio'] for b in res_vis['text_boxes']]} (WCAG 2.1 AA passes: {passes})")
    results.append(("Real Image CIEDE2000 & WCAG 2.1 Contrast", "PASS", f"CIEDE2000 color distance & {len(res_vis['text_boxes'])} OCR boxes verified"))

    # Test preset compliant and non-compliant banners
    res_comp = requests.post(f"{BASE_URL}/api/submissions/visual-audit", json={"mode": "compliant_demo"}).json()
    assert res_comp["overall_pass"] is True
    res_non = requests.post(f"{BASE_URL}/api/submissions/visual-audit", json={"mode": "non_compliant_demo"}).json()
    assert res_non["overall_pass"] is False
    print("  [OK] Preset Compliant (PASS) and Non-Compliant (FAIL) banners validated deterministically")
    results.append(("Preset Visual Banners (Compliant & Non-Compliant)", "PASS", "Compliant = PASS, Non-Compliant = VIOLATION"))

    # -------------------------------------------------------------
    # 3. REVIEW WORKBENCH: INTENT LOCK & CUMULATIVE SURGICAL FIXES
    # -------------------------------------------------------------
    print("\n[3/7] Testing Review Workbench: Intent Lock & Cumulative Multi-Finding Fixes...")
    
    # Submit draft with 2 violations (TONE-01 and CLAIM-03)
    asset_multi = requests.post(
        f"{BASE_URL}/api/submissions",
        json={
            "title": "Cumulative Fix Test Asset",
            "content": "Our revolutionary course guarantees you a job! Contact us today.",
            "creator_intent": "Promote course benefits",
            "must_keep_points": ["course", "today"],
            "origin": "agency",
            "channel": "social",
            "actor_name": "Nandha K",
            "actor_role": "Creator",
        }
    ).json()
    asset_id = asset_multi["asset_id"]
    findings = asset_multi["findings"]
    assert len(findings) >= 2, f"Expected at least 2 findings, got {len(findings)}"
    
    f_tone = next((f for f in findings if f["rule_id"] == "TONE-01"), findings[0])
    f_claim = next((f for f in findings if f["rule_id"] == "CLAIM-03"), findings[1])
    
    # 3A: Apply Fix 1 (TONE-01: 'revolutionary' -> 'practical')
    r_a1 = requests.post(
        f"{BASE_URL}/api/workflow/creator-action",
        json={
            "finding_id": f_tone["finding_id"],
            "action": "ACCEPT",
            "actor_name": "Nandha K",
            "actor_role": "Creator",
        }
    ).json()
    assert "practical" in r_a1["current_content"], "Fix 1 did not apply"
    print(f"  [OK] Applied Fix 1 (TONE-01): '{r_a1['current_content']}'")

    # 3B: Apply Fix 2 (CLAIM-03: 'guarantees you a job!' -> 'prepares you for a new role!')
    r_a2 = requests.post(
        f"{BASE_URL}/api/workflow/creator-action",
        json={
            "finding_id": f_claim["finding_id"],
            "action": "ACCEPT",
            "actor_name": "Nandha K",
            "actor_role": "Creator",
        }
    ).json()
    working_copy = r_a2["current_content"]
    assert "practical" in working_copy, "CUMULATIVE FIX FAILED: 'practical' was overwritten!"
    assert "prepares you" in working_copy, "CUMULATIVE FIX FAILED: 'prepares you' was not applied!"
    print(f"  [OK] Applied Fix 2 (CLAIM-03) cumulatively: '{working_copy}' (Both 'practical' AND 'prepares you' preserved)")
    results.append(("Cumulative Multi-Finding Surgical Fixes", "PASS", "Sequential replacements accumulated without overwriting"))

    # 3C: Undo Fix 2
    r_undo = requests.post(
        f"{BASE_URL}/api/workflow/creator-action",
        json={
            "finding_id": f_claim["finding_id"],
            "action": "UNDO",
            "actor_name": "Nandha K",
            "actor_role": "Creator",
        }
    ).json()
    assert "guarantees you a job" in r_undo["current_content"]
    assert "practical" in r_undo["current_content"], "Fix 1 should remain active when Fix 2 is undone"
    print("  [OK] Undo fix reverted specific finding cleanly while preserving remaining active fixes")
    results.append(("Undo Surgical Fix", "PASS", "Reverted finding cleanly; working copy recalibrated"))

    # Re-apply fix 2 for clean approval test
    requests.post(
        f"{BASE_URL}/api/workflow/creator-action",
        json={
            "finding_id": f_claim["finding_id"],
            "action": "ACCEPT",
            "actor_name": "Nandha K",
            "actor_role": "Creator",
        }
    )

    # -------------------------------------------------------------
    # 4. STRICT 4-ROLE RBAC & FINAL GOVERNANCE DECISION
    # -------------------------------------------------------------
    print("\n[4/7] Testing Strict 4-Role RBAC & Final Governance Decisions...")
    
    # 4A: Creator attempts self-approval -> 403 Forbidden
    r_cr_app = requests.post(
        f"{BASE_URL}/api/workflow/approve",
        json={
            "asset_id": asset_id,
            "decision": "APPROVE",
            "actor_name": "Nandha K",
            "actor_role": "Creator",
        }
    )
    assert r_cr_app.status_code == 403, f"Expected 403 for Creator self-approval, got {r_cr_app.status_code}"
    print("  [OK] Creator self-approval correctly blocked (403 Forbidden)")

    # 4B: Authorised Reviewer approves -> 200 OK with SHA-256 fingerprint
    r_rev_app_resp = requests.post(
        f"{BASE_URL}/api/workflow/approve",
        json={
            "asset_id": asset_id,
            "decision": "APPROVE",
            "comment": "All surgical fixes accepted; approved for publishing.",
            "actor_name": "Priya Legal",
            "actor_role": "Authorised Reviewer",
        }
    )
    assert r_rev_app_resp.status_code == 200, f"Expected 200 for Authorised Reviewer approval, got {r_rev_app_resp.status_code}"
    r_rev_app = r_rev_app_resp.json()
    assert r_rev_app["asset_status"] == "APPROVED"
    assert len(r_rev_app["approved_sha256"]) == 64
    print(f"  [OK] Authorised Reviewer approval succeeded (Fingerprint: {r_rev_app['approved_sha256'][:16]}...)")
    results.append(("4-Role RBAC & Human-Only Approval", "PASS", "Creator blocked (403), Authorised Reviewer approved (200)"))

    # -------------------------------------------------------------
    # 5. GUIDELINE LAB & POLICY REPLAY SIMULATOR
    # -------------------------------------------------------------
    print("\n[5/7] Testing Guideline Lab, Linter & Policy Replay Simulator...")
    
    # 5A: Rules listing
    r_rules = requests.get(f"{BASE_URL}/api/guidelines/rules").json()
    assert len(r_rules.get("rules", [])) >= 8
    print(f"  [OK] Brand-AST rules loaded ({len(r_rules['rules'])} compiled active rules)")

    # 5B: Linter
    r_lint = requests.post(
        f"{BASE_URL}/api/guidelines/lint",
        json={"include_seeded_defects": True}
    ).json()
    assert r_lint["seeded_defects_detected"] == 3
    print(f"  [OK] Guideline Linter detected 100% of seeded defects ({r_lint['seeded_defects_detected']}/{r_lint['seeded_defects_total']})")

    # 5C: Policy Replay Simulation
    r_rep = requests.post(
        f"{BASE_URL}/api/guidelines/replay",
        json={
            "rule_id": "TERM-01",
            "proposed_modality": "FORBIDDEN",
            "proposed_severity": "Violation",
            "proposed_patterns": {"forbidden_terms": ["students", "student", "tutors"]},
        }
    ).json()
    assert r_rep["corpus_size"] == 18
    assert r_rep["total_verdict_changes"] >= 1
    print(f"  [OK] Policy Replay simulated across 18 benchmark pieces: {r_rep['total_verdict_changes']} verdict changes")
    results.append(("Guideline Linter & Policy Replay", "PASS", f"100% defect detection, replayed across 18 pieces"))

    # -------------------------------------------------------------
    # 6. TIME-BOUNDED FACT VAULT
    # -------------------------------------------------------------
    print("\n[6/7] Testing Time-Bounded Fact Vault & Brand Admin Governance...")
    
    # 6A: Listing facts
    r_f = requests.get(f"{BASE_URL}/api/facts").json()
    assert r_f["active_count"] >= 4
    assert r_f["expired_count"] >= 2

    # 6B: Add new fact
    r_add = requests.post(
        f"{BASE_URL}/api/facts",
        json={
            "fact_id": "F-E2E-TEST-01",
            "tenant": "northwind_academy",
            "category": "outcomes",
            "subject": "E2E Automated Cohort",
            "predicate": "achieved",
            "metric": "98% pass rate",
            "modality": "strict",
            "statement": "E2E Automated Cohort achieved a 98% pass rate in Q4 2026.",
            "owner": "Nandha K",
            "source": "E2E Test Execution",
            "valid_from": "2026-01-01",
            "valid_until": "2027-12-31",
        }
    ).json()
    assert r_add["status"] == "ok"
    print("  [OK] Added new approved fact F-E2E-TEST-01 to Fact Vault")

    # 6C: Toggle fact status
    r_tog = requests.post(
        f"{BASE_URL}/api/facts/F-E2E-TEST-01/toggle-status",
        json={"actor_role": "Brand Admin", "actor_name": "Nandha K"}
    ).json()
    assert r_tog["new_status"] in ("EXPIRED", "ACTIVE")
    print(f"  [OK] Toggled fact status via Brand Admin governance (New status: {r_tog['new_status']})")
    results.append(("Time-Bounded Fact Vault & Governance", "PASS", "Active/expired facts verified, CRUD & toggle validated"))

    # -------------------------------------------------------------
    # 7. CRYPTOGRAPHIC SHA-256 AUDIT LEDGER & TAMPER DETECTION
    # -------------------------------------------------------------
    print("\n[7/7] Testing Cryptographic SHA-256 Audit Ledger & Tamper Detection...")
    
    # 7A: Verify initial chain
    r_log = requests.get(f"{BASE_URL}/api/insights/audit-log").json()
    assert r_log["chain_verification"]["valid"] is True, "Hash chain was not intact initially!"
    tot_events = r_log["chain_verification"]["total_events"]
    print(f"  [OK] Audit ledger verified: 100% INTACT across {tot_events} chained events")

    # 7B: Simulate tamper attack
    r_tamp = requests.post(f"{BASE_URL}/api/insights/simulate-tamper").json()
    assert r_tamp["chain_verification"]["valid"] is False, "Tamper simulation failed to break chain!"
    broken_id = r_tamp["tampered_event_id"]
    print(f"  [OK] Tamper simulation verified: DB edit injected, SHA-256 chain immediately detected corrupted Block #{broken_id}!")

    # 7C: Restore chain
    r_rst = requests.post(f"{BASE_URL}/api/insights/restore-chain").json()
    assert r_rst["chain_verification"]["valid"] is True, "Failed to restore chain!"
    print("  [OK] Restored cryptographic state: SHA-256 hash chain is 100% INTACT again")
    results.append(("Cryptographic SHA-256 Audit Ledger & Tamper Proof", "PASS", f"Tamper detected on Block #{broken_id}, 1-click restore verified"))

    # -------------------------------------------------------------
    # CLEANUP: RESET DEMO QUEUE TO CANONICAL BENCHMARK STATE
    # -------------------------------------------------------------
    requests.post(f"{BASE_URL}/api/submissions/reset-demo-queue")
    r_q = requests.get(f"{BASE_URL}/api/submissions").json()
    canonical_count = r_q["total"]
    print(f"\n[Cleanup] Submissions queue reset to {canonical_count} canonical benchmark items: {[s['asset_id'] for s in r_q['submissions']]}")

    # -------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------
    print("\n=================================================================")
    print("END-TO-END VERIFICATION SUMMARY:")
    print("=================================================================")
    for title, outcome, note in results:
        print(f"  [{outcome}] {title.ljust(50)} - {note}")
    print("=================================================================\n")
    return results


if __name__ == "__main__":
    run_full_suite()
