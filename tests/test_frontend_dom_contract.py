# -*- coding: utf-8 -*-
"""
VeriLoom Production Platform Frontend DOM and Contract Verification Test.
Validates Top Navigation Tabs, Review Workbench composer & file dropzone,
Time-Bounded Fact Vault, Banner & Contrast Lab, Guideline Lab,
SHA-256 Audit Ledger, and VeriLoom AI Copilot modal contracts.
"""
import re
import os
import pytest

def test_veriloom_core_tokens_in_css():
    css_path = os.path.join("frontend", "css", "styles.css")
    assert os.path.exists(css_path), "styles.css must exist"
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    # Core typography & glass design tokens
    assert "--font-header" in css
    assert "--font-openai-sans" in css
    assert ".data-chip" in css
    assert ".modality-chip" in css
    assert ".status-toast-banner" in css
    assert ".copilot-panel" in css
    assert ".copilot-streaming-cursor" in css


def test_top_nav_and_tabs():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Navigation tabs
    assert 'id="tab-btn-workbench"' in html
    assert 'id="tab-btn-visual"' in html
    assert 'id="tab-btn-guidelines"' in html
    assert 'id="tab-btn-facts"' in html
    assert 'id="tab-btn-insights"' in html
    assert 'id="tab-btn-audit"' in html

    # Role selector
    assert 'id="active-role-select"' in html
    assert 'value="Creator"' in html
    assert 'value="Brand Manager"' in html
    assert 'value="Authorised Reviewer"' in html
    assert 'value="Brand Admin"' in html

    assert "function switchTab" in js
    assert "function onRoleChanged" in js
    assert "function switchToRole" in js


def test_fact_vault_dom_contract():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Hero subtitle chip
    assert "[valid_from, valid_until]" in html
    assert 'id="facts-hero"' in html
    assert 'id="fact-vault-table-box"' in html

    # Add fact form inputs
    assert 'id="new-fact-id"' in html
    assert 'id="new-fact-subject"' in html
    assert 'id="new-fact-metric"' in html
    assert 'id="new-fact-modality"' in html
    assert 'id="new-fact-statement"' in html
    assert 'id="new-fact-from"' in html
    assert 'id="new-fact-until"' in html

    # JS functions
    assert "function loadFactVault" in js
    assert "function submitNewFact" in js
    assert "function toggleFactStatus" in js
    assert "function renderFactVaultView" in js


def test_workbench_dom_contract():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Draft composer and upload
    assert 'id="sub-content"' in html
    assert 'id="btn-verify-draft"' in html
    assert 'id="file-upload-input"' in html
    assert 'id="sub-intent"' in html
    assert 'id="sub-origin"' in html
    assert 'id="sub-channel"' in html

    # Output areas
    assert 'id="active-findings-list"' in html
    assert 'id="active-submission-panel"' in html

    # JS functions
    assert "function submitContentForVerification" in js
    assert "function uploadDocumentFile" in js
    assert "function handleCreatorFindingAction" in js


def test_visual_and_contrast_contract():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert 'id="panel-visual"' in html
    assert 'id="custom-banner-input"' in html
    assert 'id="visual-audit-results"' in html

    assert "function uploadCustomBannerImage" in js
    assert "function renderVisualAuditResults" in js
    assert "function runBannerContrastAnalysis" in js or "analyzeBannerContrast" in js or "uploadCustomBannerImage" in js


def test_audit_ledger_dom_contract():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert 'id="btn-simulate-tamper"' in html
    assert 'id="btn-restore-chain"' in html
    assert 'id="audit-chain-summary-box"' in html
    assert 'id="audit-events-table-box"' in html

    assert "function loadAuditLedger" in js
    assert "function triggerTamperSimulation" in js
    assert "function restoreTamperedChain" in js


def test_copilot_dom_contract():
    html_path = os.path.join("frontend", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    assert 'id="chatbox-overlay"' in html or 'id="copilot-overlay"' in html
    assert 'id="copilot-close-btn"' in html
    assert 'id="copilot-input"' in html
    assert 'id="copilot-send-btn"' in html
    assert 'id="copilot-messages"' in html


def test_all_html_onclick_handlers_exist_in_js():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    onclick_matches = set(re.findall(r'onclick=[\"\']([a-zA-Z0-9_]+)\(', html))
    for handler in onclick_matches:
        assert (f"function {handler}" in js or f"{handler} =" in js or f"let {handler}" in js), (
            f"HTML onclick handler '{handler}' is not defined in frontend/js/app.js!"
        )
