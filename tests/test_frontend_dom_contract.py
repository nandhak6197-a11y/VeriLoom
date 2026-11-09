# -*- coding: utf-8 -*-
"""
Round 3 R4 Frontend DOM and Contract Verification Test.
Validates Obsidian & Emerald tokens, Top-Nav Jurisdiction Switcher,
Knowledge Graph Visualizer & Live Sync HUD, Step 2 Legal Disclosure Card,
Step 2 Logo Safe-Zone overlay, and Step 3 Certificate Download CTA.
"""
import re
import os
import pytest

def test_obsidian_and_emerald_tokens_in_css():
    css_path = os.path.join("frontend", "css", "styles.css")
    assert os.path.exists(css_path), "styles.css must exist"
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    # Core Obsidian and Emerald tokens
    assert "--bg-canvas: #090D16" in css or "--bg-canvas: #090d16" in css.lower()
    assert "--bg-card: #0F172A" in css or "--bg-card: #0f172a" in css.lower()
    assert "--bg-card-elevated: #1E293B" in css or "--bg-card-elevated: #1e293b" in css.lower()
    assert "--accent-emerald: #10B981" in css or "--accent-emerald: #10b981" in css.lower()
    assert "--accent-amber: #F59E0B" in css or "--accent-amber: #f59e0b" in css.lower()
    assert "--accent-rose: #F43F5E" in css or "--accent-rose: #f43f5e" in css.lower()

    # Required button and component styles
    assert ".jurisdiction-pill" in css
    assert ".btn-emerald-glowing" in css
    assert ".btn-cta-cert" in css
    assert ".disclosure-card" in css
    assert ".knowledge-sync-hud" in css
    assert "#fact-knowledge-graph-canvas" in css
    assert ".safe-zone-table" in css


def test_top_nav_jurisdiction_switcher():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert 'id="active-jurisdiction-select"' in html
    assert 'value="US"' in html
    assert 'value="EU"' in html
    assert 'value="UK"' in html
    assert 'value="GLOBAL"' in html or 'value="Global"' in html

    assert "let CURRENT_JURISDICTION" in js
    assert "function onJurisdictionChanged" in js
    assert "recompileSubmissionForJurisdiction" in js


def test_fact_vault_knowledge_graph_and_live_sync_hud():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    # Fact vault controls
    assert 'id="fact-view-table-btn"' in html
    assert 'id="fact-view-graph-btn"' in html
    assert 'id="btn-sync-hud-toggle"' in html
    assert 'id="knowledge-sync-hud"' in html
    assert 'id="sync-source-type"' in html
    assert 'id="sync-scenario-preset"' in html
    assert 'id="btn-execute-sync"' in html
    assert 'id="sync-hud-terminal"' in html
    assert 'id="sync-terminal-output"' in html
    assert 'id="fact-knowledge-graph-canvas"' in html
    assert 'id="graph-node-details"' in html

    # JS functions
    assert "function setFactViewMode" in js
    assert "function toggleKnowledgeSyncHud" in js
    assert "function executeEnterpriseKnowledgeSync" in js
    assert "function loadKnowledgeGraph" in js
    assert "function drawKnowledgeGraph" in js


def test_step2_legal_disclosure_card_and_gauge():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert 'id="legal-disclosure-card"' in html
    assert 'id="disclosure-rule-title"' in html
    assert 'id="disclosure-channel-badge"' in html
    assert 'id="disclosure-explanation"' in html
    assert 'id="disclosure-text-preview"' in html
    assert 'id="disclosure-char-count-label"' in html
    assert 'id="disclosure-char-meter-fill"' in html
    assert 'id="btn-inject-disclosure"' in html

    assert "function evaluateRegulatoryDisclosures" in js
    assert "function injectCompliantDisclosure" in js


def test_step2_banner_safezone_overlay_and_table():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert 'id="btn-toggle-safezone-overlay"' in html
    assert 'id="visual-inspector-canvas"' in html
    assert 'id="visual-audit-results"' in html

    assert "let SHOW_SAFEZONE_OVERLAY" in js
    assert "function toggleLogoSafeZoneOverlay" in js
    assert "function drawVisualCanvas" in js
    assert "safe_zone_audit" in js


def test_step3_download_certificate_button():
    html_path = os.path.join("frontend", "index.html")
    js_path = os.path.join("frontend", "js", "app.js")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert 'id="btn-download-certificate"' in html
    assert "function downloadVerificationCertificate" in js
    assert "/certificate" in js


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
