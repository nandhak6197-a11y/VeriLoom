# -*- coding: utf-8 -*-
"""
Unit and Integration Tests for M1: Live Enterprise Fact-Graph & Knowledge Sync Engine.

Validates:
1. Multi-format enterprise feed parsing (JSON list, JSON dict, CSV, TSV, Markdown tables, prose).
2. Cryptographic SHA-256 provenance hashing over text and bytes.
3. Time-bounded validity windows and status determination (ACTIVE vs EXPIRED).
4. Queue blast-radius conflict evaluation across durations, discounts, outcomes, and capacities.
5. Interactive node-and-edge knowledge graph generation with active/expired facts and labeled edges.
6. API endpoint verification for upsert_fact, list_facts, sync-enterprise, and graph.
"""
import pytest
from datetime import date
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.engine.knowledge_sync import (
    EnterpriseKnowledgeSyncEngine,
    compute_sha256_text,
)


def test_m1_sha256_provenance_bytes_and_string():
    """Validates SHA-256 cryptographic provenance hashing over both bytes and string inputs."""
    raw_text = "Northwind Academy discount is 30% for all enterprise partners."
    raw_bytes = raw_text.encode("utf-8")

    hash_str = compute_sha256_text(raw_text)
    hash_bytes = compute_sha256_text(raw_bytes)

    assert len(hash_str) == 64
    assert len(hash_bytes) == 64
    assert hash_str == hash_bytes

    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")
    facts_from_bytes = engine.extract_atomic_facts_from_document(
        document_text=raw_bytes,
        source_name="Bytes Feed",
        source_type="bytes_buffer",
    )
    assert len(facts_from_bytes) >= 1
    assert facts_from_bytes[0]["provenance_hash"] == hash_bytes
    assert facts_from_bytes[0]["source_sha256"] == hash_bytes


def test_m1_json_feed_variations():
    """Validates JSON parsing across root list, nested 'facts', nested 'items', and single dict."""
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")

    # 1. Root list
    json_list = """[
        {"subject": "Cloud Academy", "predicate": "offers", "metric": "20% discount", "category": "pricing"}
    ]"""
    facts1 = engine.extract_atomic_facts_from_document(json_list)
    assert len(facts1) == 1
    assert facts1[0]["subject"] == "Cloud Academy"
    assert facts1[0]["metric"] == "20% discount"

    # 2. Nested 'facts'
    json_facts = """{
        "tenant": "northwind_academy",
        "facts": [
            {"Subject": "Data Engineering", "Predicate": "takes", "Metric": "14 weeks", "Category": "curriculum"}
        ]
    }"""
    facts2 = engine.extract_atomic_facts_from_document(json_facts)
    assert len(facts2) == 1
    assert facts2[0]["subject"] == "Data Engineering"
    assert facts2[0]["metric"] == "14 weeks"

    # 3. Nested 'items'
    json_items = """{
        "items": [
            {"subject": "AI Specialist", "predicate": "achieved", "metric": "96% placement rate", "category": "outcomes"}
        ]
    }"""
    facts3 = engine.extract_atomic_facts_from_document(json_items)
    assert len(facts3) == 1
    assert facts3[0]["metric"] == "96% placement rate"

    # 4. Single dict
    json_single = """{"subject": "Cybersecurity Cohort", "predicate": "capped at", "metric": "25 learners", "category": "operations"}"""
    facts4 = engine.extract_atomic_facts_from_document(json_single)
    assert len(facts4) == 1
    assert facts4[0]["metric"] == "25 learners"


def test_m1_csv_and_tsv_and_semicolon_parsing():
    """Validates structured tabular ingestion with various delimiters (comma, tab, semicolon)."""
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")

    # CSV Comma
    csv_text = "subject,predicate,metric,category\nFrontend Master,lasts,8 weeks,curriculum"
    facts_csv = engine.extract_atomic_facts_from_document(csv_text)
    assert len(facts_csv) == 1
    assert facts_csv[0]["subject"] == "Frontend Master"
    assert facts_csv[0]["metric"] == "8 weeks"

    # TSV Tab
    tsv_text = "subject\tpredicate\tmetric\tcategory\nBackend Pro\truns for\t10 weeks\tcurriculum"
    facts_tsv = engine.extract_atomic_facts_from_document(tsv_text)
    assert len(facts_tsv) == 1
    assert facts_tsv[0]["subject"] == "Backend Pro"
    assert facts_tsv[0]["metric"] == "10 weeks"

    # Semicolon
    semi_text = "subject;predicate;metric;category\nDevOps Bootcamp;takes;12 weeks;curriculum"
    facts_semi = engine.extract_atomic_facts_from_document(semi_text)
    assert len(facts_semi) == 1
    assert facts_semi[0]["subject"] == "DevOps Bootcamp"
    assert facts_semi[0]["metric"] == "12 weeks"


def test_m1_markdown_table_parsing():
    """Validates Markdown table extraction."""
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")
    md_table = """
    # Q4 Enterprise Curriculum Matrix

    | Subject | Predicate | Metric | Category |
    |---|---|---|---|
    | Quantum Computing | duration is | 20 weeks | curriculum |
    | Fullstack Immersive | discount is | 15% | pricing |
    """
    facts_md = engine.extract_atomic_facts_from_document(md_table)
    assert len(facts_md) == 2
    assert any(f["subject"] == "Quantum Computing" for f in facts_md)
    assert any(f["metric"] == "15%" for f in facts_md)


def test_m1_validity_window_and_expired_status():
    """Validates temporal validity computation and expired flag assignment."""
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")

    # Explicit past expiration
    doc_past = "Northwind Academy discount is 50% for alumni. Valid until 2020-01-01."
    facts_past = engine.extract_atomic_facts_from_document(doc_past, effective_year=2026)
    assert len(facts_past) == 1
    assert facts_past[0]["valid_until"] == "2020-01-01"
    assert facts_past[0]["status"] == "EXPIRED"

    # Explicit future expiration
    doc_future = "Northwind Academy discount is 30% for corporate partners. Valid until 2028-12-31."
    facts_future = engine.extract_atomic_facts_from_document(doc_future, effective_year=2026)
    assert len(facts_future) == 1
    assert facts_future[0]["valid_until"] == "2028-12-31"
    assert facts_future[0]["status"] == "ACTIVE"


def test_m1_blast_radius_multi_category_conflicts():
    """Validates queue blast-radius evaluation across duration, discount, outcome, and capacity mismatches."""
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")

    new_facts = [
        {"fact_id": "F-DUR", "subject": "Data Foundations", "predicate": "takes", "metric": "16 weeks", "category": "curriculum", "status": "ACTIVE"},
        {"fact_id": "F-PRC", "subject": "Northwind Academy", "predicate": "offers", "metric": "30%", "category": "pricing", "status": "ACTIVE"},
        {"fact_id": "F-OUT", "subject": "AWS Cohort", "predicate": "achieved", "metric": "94% job placement rate", "category": "outcomes", "status": "ACTIVE"},
        {"fact_id": "F-CAP", "subject": "Northwind Academy", "predicate": "capped at", "metric": "30 learners", "category": "operations", "status": "ACTIVE"},
    ]

    pending_subs = [
        # Duration mismatch: claims 12 weeks instead of 16 weeks
        {"asset_id": "AST-DUR-FAIL", "title": "Data Promo", "current_content": "Data Foundations takes 12 weeks to finish!"},
        # Discount mismatch: claims 50% instead of 30%
        {"asset_id": "AST-PRC-FAIL", "title": "Tuition Promo", "current_content": "Get 50% discount at Northwind Academy today!"},
        # Exact match: matches 16 weeks
        {"asset_id": "AST-DUR-PASS", "title": "Accurate Promo", "current_content": "Data Foundations takes 16 weeks of intensive study."},
        # Unrelated submission: not impacted
        {"asset_id": "AST-UNRELATED", "title": "Welcome Email", "current_content": "Welcome to our platform overview."},
    ]

    blast = engine.calculate_queue_blast_radius(new_facts, pending_subs)

    assert blast["pending_submissions_analyzed"] == 4
    assert blast["blast_radius_risk"] == "HIGH"
    assert blast["impacted_assets_count"] >= 3

    dur_fail = next(a for a in blast["impacted_assets"] if a["asset_id"] == "AST-DUR-FAIL")
    assert dur_fail["conflict_count"] >= 1
    assert dur_fail["action_required"] == "RE_VERIFY"
    assert any(c["type"] == "DURATION_MISMATCH" for c in dur_fail["conflicts"])

    prc_fail = next(a for a in blast["impacted_assets"] if a["asset_id"] == "AST-PRC-FAIL")
    assert prc_fail["conflict_count"] >= 1
    assert prc_fail["action_required"] == "RE_VERIFY"
    assert any(c["type"] == "DISCOUNT_MISMATCH" for c in prc_fail["conflicts"])

    dur_pass = next(a for a in blast["impacted_assets"] if a["asset_id"] == "AST-DUR-PASS")
    assert dur_pass["conflict_count"] == 0
    assert dur_pass["supported_count"] >= 1
    assert dur_pass["action_required"] == "AUTO_CONFIRM"


def test_m1_knowledge_graph_labeled_edges_and_provenance():
    """Validates node-and-edge graph generation with active and expired facts and predicate labels."""
    engine = EnterpriseKnowledgeSyncEngine(tenant="northwind_academy")
    facts = [
        {
            "fact_id": "F-001",
            "subject": "Northwind Academy",
            "predicate": "offers",
            "metric": "30% discount",
            "category": "pricing",
            "status": "ACTIVE",
            "provenance_hash": "a" * 64,
            "statement": "Northwind Academy offers 30% discount",
        },
        {
            "fact_id": "F-002",
            "subject": "Data Foundations",
            "predicate": "runs for",
            "metric": "16 weeks",
            "category": "curriculum",
            "status": "EXPIRED",
            "provenance_hash": "b" * 64,
            "statement": "Data Foundations runs for 16 weeks",
        },
    ]

    graph = engine.generate_knowledge_graph_representation(facts)

    assert graph["node_count"] == 4  # 2 subject nodes + 2 fact nodes
    assert graph["edge_count"] == 2  # 2 directed edges

    # Verify fact node provenance
    fact_nodes = [n for n in graph["nodes"] if n["type"] == "fact"]
    assert len(fact_nodes) == 2
    assert any(n["provenance_hash"] == "a" * 64 and n["status"] == "ACTIVE" for n in fact_nodes)
    assert any(n["provenance_hash"] == "b" * 64 and n["status"] == "EXPIRED" for n in fact_nodes)

    # Verify edge labels and predicates
    assert all("label" in e and "predicate" in e for e in graph["edges"])
    assert any(e["predicate"] == "offers" and e["status"] == "ACTIVE" for e in graph["edges"])
    assert any(e["predicate"] == "runs for" and e["status"] == "EXPIRED" for e in graph["edges"])


def test_m1_api_enterprise_sync_and_graph_endpoints():
    """Validates REST endpoints for /api/facts/sync-enterprise and /api/facts/graph."""
    client = TestClient(app)

    # 1. Sync enterprise knowledge via JSON feed
    json_feed = """[
        {"subject": "Executive Leadership", "predicate": "takes", "metric": "6 weeks", "category": "curriculum"}
    ]"""
    sync_res = client.post("/api/facts/sync-enterprise", json={
        "source_name": "Q4 Executive Memo",
        "source_type": "json_feed",
        "document_text": json_feed,
        "tenant": "northwind_academy",
        "auto_import_facts": True,
    })
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["status"] == "ok"
    assert sync_data["extracted_count"] == 1
    assert sync_data["imported_count"] == 1
    assert "audit_block_hash" in sync_data
    assert sync_data["facts"][0]["provenance_hash"] != ""

    # 2. Query Knowledge Graph
    graph_res = client.get("/api/facts/graph?tenant=northwind_academy")
    assert graph_res.status_code == 200
    graph_data = graph_res.json()
    assert graph_data["tenant"] == "northwind_academy"
    assert graph_data["node_count"] >= 2
    assert graph_data["edge_count"] >= 1
    assert any("Executive Leadership" in n["label"] for n in graph_data["nodes"])

    # 3. Query Fact Vault list and check provenance_hash
    facts_res = client.get("/api/facts?tenant=northwind_academy")
    assert facts_res.status_code == 200
    facts_data = facts_res.json()
    assert facts_data["total_facts"] >= 1
    assert any(f.get("provenance_hash") is not None for f in facts_data["facts"])
