# -*- coding: utf-8 -*-
"""Layer 1: Multi-Format Ingestion (Text, Markdown, DOCX, PDF, PNG/JPG) & Dual Fingerprinting."""
import hashlib
import io
import re
from typing import Dict, Any, List


def compute_sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compute_sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_text(raw_text: str) -> str:
    """Normalizes line endings and collapses redundant horizontal whitespace while keeping paragraph breaks."""
    if not raw_text:
        return ""
    cleaned = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in cleaned.split("\n")]
    return "\n".join(line for line in lines if line != "" or len(lines) == 1).strip()


def split_into_sentences(text: str) -> List[str]:
    """Splits text into sentences while keeping bracketed media/link tags intact."""
    if not text:
        return []
    # Preserve bracketed annotations such as [Image: ... | Alt text: none]
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\[])", text.strip())
    return [p.strip() for p in parts if p.strip()]


def ingest_document_bytes(filename: str, file_bytes: bytes) -> Dict[str, Any]:
    """
    Parses uploaded bytes (.txt, .md, .docx, .pdf, .png, .jpg) into normalized text segments
    and returns dual SHA-256 fingerprints per Section 5.2 Layer 1.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "txt"
    original_sha256 = compute_sha256_bytes(file_bytes)
    extracted_text = ""
    content_type = "text"
    metadata: Dict[str, Any] = {"filename": filename, "extension": ext, "byte_size": len(file_bytes)}

    if ext in ("txt", "md", "markdown"):
        content_type = "markdown" if ext in ("md", "markdown") else "text"
        extracted_text = file_bytes.decode("utf-8", errors="replace")

    elif ext == "docx":
        content_type = "docx"
        try:
            import docx
            doc = docx.Document(io.BytesIO(file_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        paragraphs.append(row_text)
            extracted_text = "\n".join(paragraphs)
            metadata["paragraph_count"] = len(paragraphs)
        except Exception as exc:
            # Fallback for corrupted/unparseable PDF binaries: extract printable strings without binary noise
            clean_strs = re.findall(r"[A-Za-z0-9 ,.'\"\-:;!?()]{4,}", file_bytes.decode("latin-1", errors="ignore"))
            extracted_text = " ".join(clean_strs)[:10000]
            metadata["parse_warning"] = str(exc)

    elif ext == "pdf":
        content_type = "pdf"
        try:
            import pymupdf
            doc = pymupdf.open(stream=file_bytes, filetype="pdf")
            pages_text = []
            image_count = 0
            for page_idx, page in enumerate(doc):
                if page_idx >= 5:
                    metadata["page_cap_note"] = "Campaign copy capped to first 5 pages for rapid verification"
                    break
                t = page.get_text("text").strip()
                if t:
                    pages_text.append(t)
                image_count += len(page.get_images(full=True))

            extracted_text = "\n\n".join(pages_text).strip()[:8000]

            if not extracted_text.strip() and image_count > 0:
                # Scanned or raster image PDF OCR fallback (§Round 3 Improvement 3)
                from backend.app.engine.layout_safezone import parse_scanned_pdf_bytes
                raster_res = parse_scanned_pdf_bytes(file_bytes)
                extracted_text = raster_res.get("extracted_text", "")
                metadata["ocr_raster_fallback"] = True
                metadata["detected_layers"] = raster_res.get("detected_layers", image_count)
                metadata["total_images"] = raster_res.get("total_images", image_count)
                metadata["pages"] = raster_res.get("pages", [])
                metadata["image_structures"] = raster_res.get("pages", [])
                metadata["is_scanned_pdf"] = raster_res.get("is_scanned_pdf", True)

            metadata["page_count"] = len(doc)
            metadata["embedded_images"] = max(image_count, metadata.get("total_images", 0))
        except Exception as exc:
            # Fallback for corrupted/unparseable PDF binaries: extract printable strings without binary noise
            clean_strs = re.findall(r"[A-Za-z0-9 ,.'\"\-:;!?()]{4,}", file_bytes.decode("latin-1", errors="ignore"))
            extracted_text = " ".join(clean_strs)[:10000]
            metadata["parse_warning"] = str(exc)

    elif ext in ("png", "jpg", "jpeg"):
        content_type = "image"
        extracted_text = f"[Uploaded Image Asset: {filename}]"
        metadata["is_binary_image"] = True

    else:
        extracted_text = file_bytes.decode("utf-8", errors="replace")

    normalized = normalize_text(extracted_text)
    normalized_sha256 = compute_sha256_text(normalized)

    return {
        "content_type": content_type,
        "raw_content": extracted_text,
        "normalized_content": normalized,
        "sentences": split_into_sentences(normalized),
        "original_sha256": original_sha256,
        "normalized_sha256": normalized_sha256,
        "metadata": metadata,
    }
