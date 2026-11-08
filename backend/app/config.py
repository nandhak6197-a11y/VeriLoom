# -*- coding: utf-8 -*-
"""Centralized configuration and constants for VeriLoom Round 2 MVP."""
import os
from pathlib import Path
from datetime import date

BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = BASE_DIR / "backend"
DATA_DIR = Path(__file__).resolve().parent / "data"
FRONTEND_DIR = BASE_DIR / "frontend"
DOCS_DIR = BASE_DIR / "docs"
BENCHMARKS_DIR = BASE_DIR / "benchmarks"

# Database configuration (SQLite with WAL mode for zero-setup reliability)
DB_PATH = BACKEND_DIR / "veriloom.db"
DATABASE_URL = os.getenv("VERILOOM_DATABASE_URL", f"sqlite:///{DB_PATH.as_posix()}")

# Reference date for deterministic temporal fact evaluation (Nov 2026 per Round 1 specification)
# Ensures facts expiring on 2026-06-30 (e.g., F-014 and F-OUT-2025 / P13) are consistently caught as expired.
DEFAULT_REVIEW_DATE = date(2026, 11, 5)

# Mathematical Thresholds from Section 4.6 of Round 1 Specification
IPM_COSINE_WEIGHT = 0.65
IPM_EDIT_WEIGHT = 0.35
IPM_THRESHOLD = 0.85

# Reviewer Override Rate (ROR) Thresholds (Section 4.6)
ROR_TRAINING_GAP_MAX = 0.15       # < 15% override with high volume -> Creator training gap
ROR_UNCLEAR_GUIDELINE_MIN = 0.45  # > 45% override -> Unclear guideline candidate

# Visual & Accessibility Thresholds (Section 4.5 Improvement 3)
CIEDE2000_MAX_DELTA = 2.5         # Perceptible off-palette colour threshold
WCAG_AA_NORMAL_CONTRAST = 4.5     # WCAG 2.1 AA normal text contrast ratio
WCAG_AA_LARGE_CONTRAST = 3.0      # WCAG 2.1 AA large text contrast ratio
LOGO_ASPECT_RATIO_TOLERANCE = 0.05  # 5% tolerance on approved logo aspect ratio

# Four Roles in Workflow (Section 2.2 & 6.1)
VALID_ROLES = [
    "Creator",
    "Brand Manager",
    "Authorised Reviewer",
    "Brand Admin",
]

# High-risk categories requiring routing to Authorised Reviewer (Section 4.3 Step 8)
HIGH_RISK_CATEGORIES = {"health", "pricing", "legal", "placement_outcomes", "regulatory"}

# Structured Waiver / Override Reason Codes (Section 4.3 Step 8 & 6.1)
WAIVER_REASON_CODES = {
    "FALSE_POSITIVE": "Checker flagged valid content in error",
    "CREATIVE_EXCEPTION": "Intentional stylistic choice approved for campaign",
    "APPROVED_PROMO_OVERRIDE": "Temporary promotional exception with legal sign-off",
    "UNCLEAR_RULE": "Guideline clause is ambiguous or contradictory (routes to Guideline Lab)",
}
