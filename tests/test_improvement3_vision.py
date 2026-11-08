# -*- coding: utf-8 -*-
"""Acceptance Tests for Improvement 3: Measured Visual & Accessibility Checks (§4.5.3)."""
from backend.app.engine.vision_auditor import (
    hex_to_rgb,
    wcag_contrast_ratio,
    ciede2000,
    nearest_palette_match,
    generate_test_banner_png,
    audit_image_bytes,
)


def test_4_5_3a_wcag_contrast_matches_reference_calculator():
    """
    §4.5.3(a): Contrast ratios match a reference WCAG 2.1 calculator within rounding.
    """
    # Pure white on pure black = 21.0:1
    assert wcag_contrast_ratio(hex_to_rgb("#FFFFFF"), hex_to_rgb("#000000")) == 21.0
    # Identical colour = 1.0:1
    assert wcag_contrast_ratio(hex_to_rgb("#0F2B48"), hex_to_rgb("#0F2B48")) == 1.0
    # Northwind Navy (#0F2B48) on Canvas White (#F8FAFC) = 13.84:1 (>= 4.5:1 AA pass)
    navy_white = wcag_contrast_ratio(hex_to_rgb("#0F2B48"), hex_to_rgb("#F8FAFC"))
    assert 13.7 <= navy_white <= 14.0
    # Light grey (#B8C2CC) on Canvas White (#F8FAFC) = 1.72:1 (< 4.5:1 AA fail)
    grey_white = wcag_contrast_ratio(hex_to_rgb("#B8C2CC"), hex_to_rgb("#F8FAFC"))
    assert 1.65 <= grey_white <= 1.80


def test_4_5_3b_same_image_gives_identical_result_every_run():
    """
    §4.5.3(b): Same image gives the exact same result on every run.
    """
    png_bytes, meta = generate_test_banner_png(compliant=False)
    run1 = audit_image_bytes(png_bytes, logo_dimensions=meta["logo_dimensions"])
    run2 = audit_image_bytes(png_bytes, logo_dimensions=meta["logo_dimensions"])
    run3 = audit_image_bytes(png_bytes, logo_dimensions=meta["logo_dimensions"])

    assert run1["dominant_swatches"] == run2["dominant_swatches"] == run3["dominant_swatches"]
    assert run1["text_boxes"] == run2["text_boxes"] == run3["text_boxes"]
    assert run1["findings"] == run2["findings"] == run3["findings"]


def test_4_5_3c_off_palette_colour_and_low_contrast_box_flagged_with_measured_distance():
    """
    §4.5.3(c): Known off-palette colour (#FF4500) is flagged with its measured CIEDE2000 distance,
    low-contrast OCR text box is flagged, and compliant banner passes cleanly.
    """
    # Zero distance for exact brand colour
    assert ciede2000(hex_to_rgb("#0F2B48"), hex_to_rgb("#0F2B48")) == 0.0
    off_match = nearest_palette_match(hex_to_rgb("#FF4500"))
    assert off_match["within_tolerance"] is False
    assert off_match["delta_e00"] > 30.0

    # Non-compliant banner audit
    bad_png, bad_meta = generate_test_banner_png(compliant=False)
    bad_audit = audit_image_bytes(bad_png, logo_dimensions=bad_meta["logo_dimensions"])
    assert bad_audit["overall_pass"] is False
    assert bad_audit["off_palette_count"] >= 1
    assert bad_audit["failing_contrast_boxes"] >= 1
    assert bad_audit["logo_check"]["pass"] is False
    rule_ids = {f["rule_id"] for f in bad_audit["findings"]}
    assert {"VIS-01", "ACC-02", "VIS-02"}.issubset(rule_ids)

    # Compliant banner audit
    good_png, good_meta = generate_test_banner_png(compliant=True)
    good_audit = audit_image_bytes(good_png, logo_dimensions=good_meta["logo_dimensions"])
    assert good_audit["overall_pass"] is True
    assert good_audit["off_palette_count"] == 0
    assert good_audit["failing_contrast_boxes"] == 0
    assert good_audit["logo_check"]["pass"] is True
