"""
CortX Document Extractor Sidecar
=================================
Runs as a persistent child process (launched by the Electron main process).
Communicates via newline-delimited JSON on stdin/stdout.

Protocol:
  IN  (one JSON line per request):
      {"id": "<uuid>", "cmd": "health"}
      {"id": "<uuid>", "cmd": "extract", "path": "<absolute path>", "options": {}}
      {"id": "<uuid>", "cmd": "embed", "texts": ["...", "..."]}
      {"id": "<uuid>", "cmd": "shutdown"}

  OUT (one JSON line per response):
      {"id": "<uuid>", "ok": true, "data": {...}}
      {"id": "<uuid>", "ok": false, "error": "<message>"}

All errors are returned as {"ok": false, "error": "..."} — the process never crashes
on bad input.
"""

import sys
import json
import traceback
import os

# ---------------------------------------------------------------------------
# Lazy-loaded heavy imports — only imported on first use so the health check
# responds fast even before models are fully loaded.
# ---------------------------------------------------------------------------
_docling_converter = None  # Tuple of (key, converter) or None
_embed_model = None


def _get_converter(force_ocr: bool = False):
    """
    Returns a DocumentConverter configured for low memory usage.

    Default mode ("fast"):
      - OCR off
      - Table structure off
      - Layout batch size 1 (one page at a time)
      - force_backend_text on (use PDF's embedded text layer directly)
    This handles 95% of business PDFs (they have a text layer).

    force_ocr mode:
      - OCR on, but batch size 1 to limit memory
    """
    global _docling_converter
    key = "ocr" if force_ocr else "fast"
    if _docling_converter is not None and _docling_converter[0] == key:
        return _docling_converter[1]

    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions

    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = force_ocr
    pipeline_options.do_table_structure = False
    pipeline_options.layout_batch_size = 1
    pipeline_options.ocr_batch_size = 1
    pipeline_options.generate_page_images = False
    pipeline_options.generate_picture_images = False

    if not force_ocr:
        # Skip the heavy layout model — extract text directly from PDF backend.
        # This avoids the preprocess stage that renders pages to images
        # and causes std::bad_alloc on large documents.
        pipeline_options.force_backend_text = True

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        }
    )
    _docling_converter = (key, converter)
    return converter


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        # Multilingual model, ~120 MB, works for FR and EN
        _embed_model = SentenceTransformer("intfloat/multilingual-e5-small")
    return _embed_model


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def cmd_health(_req: dict) -> dict:
    """Returns which models are loaded (lazy — may not be loaded yet)."""
    return {
        "ok": True,
        "sidecar_version": "1.0.0",
        "docling_ready": _docling_converter is not None,
        "embed_ready": _embed_model is not None,
        "python_version": sys.version,
    }


def cmd_extract(req: dict) -> dict:
    """
    Extracts text and structure from a document file using Docling.

    Returns:
      - markdown: full extracted text as Markdown
      - metadata: {title, author, page_count, ...}
      - structure: list of {heading, text, page_from, page_to} sections
    """
    path = req.get("path", "")
    if not path or not os.path.isfile(path):
        return {"ok": False, "error": f"File not found: {path}"}

    force_ocr = bool(req.get("ocr", False))
    converter = _get_converter(force_ocr=force_ocr)
    result = converter.convert(path)
    doc = result.document

    # --- Markdown export ---
    markdown_text = doc.export_to_markdown()

    # --- Metadata ---
    metadata = {}
    # Try doc.origin for document-level metadata
    origin = getattr(doc, "origin", None)
    if origin:
        metadata["title"] = getattr(origin, "filename", None) or os.path.splitext(os.path.basename(path))[0]
    else:
        metadata["title"] = os.path.splitext(os.path.basename(path))[0]
    metadata["author"] = None
    metadata["page_count"] = None

    # Page count: num_pages() method or length of pages dict
    try:
        pc = doc.num_pages()
        metadata["page_count"] = pc if pc else None
    except Exception:
        pass
    if metadata["page_count"] is None and hasattr(doc, "pages") and doc.pages:
        metadata["page_count"] = len(doc.pages)

    # --- Structured sections (headings + text blocks) ---
    # Iterate directly on doc (not doc.body) — correct API in current Docling versions
    structure = []
    current_heading = None
    current_text_parts = []
    current_page_from = None
    current_page_to = None

    def flush_section():
        if current_text_parts:
            structure.append({
                "heading": current_heading,
                "text": "\n\n".join(current_text_parts).strip(),
                "page_from": current_page_from,
                "page_to": current_page_to,
            })

    for item, _ in doc.iterate_items():
        item_type = type(item).__name__

        # Extract page numbers from provenance
        page_from = None
        page_to = None
        if hasattr(item, "prov") and item.prov:
            pages = [p.page_no for p in item.prov if hasattr(p, "page_no")]
            if pages:
                page_from = min(pages)
                page_to = max(pages)

        if item_type in ("SectionHeaderItem", "TitleItem"):
            flush_section()
            current_heading = item.text if hasattr(item, "text") else str(item)
            current_text_parts = []
            current_page_from = page_from
            current_page_to = page_to
        elif hasattr(item, "text") and item.text:
            if current_page_from is None:
                current_page_from = page_from
            if page_to is not None:
                current_page_to = page_to
            current_text_parts.append(item.text)

    flush_section()

    # Fallback: if no structure was extracted, treat the whole markdown as one section
    if not structure and markdown_text:
        structure = [{
            "heading": metadata.get("title"),
            "text": markdown_text,
            "page_from": 1,
            "page_to": metadata.get("page_count"),
        }]

    return {
        "ok": True,
        "markdown": markdown_text,
        "metadata": metadata,
        "structure": structure,
    }


def cmd_embed(req: dict) -> dict:
    """
    Generates embeddings for a list of texts using sentence-transformers.

    Input:  {"texts": ["text1", "text2", ...]}
    Output: {"vectors": [[0.1, ...], [0.2, ...], ...]}

    Uses the 'query:' prefix convention of e5 models for passage encoding.
    """
    texts = req.get("texts", [])
    if not texts:
        return {"ok": True, "vectors": []}

    model = _get_embed_model()

    # e5 models expect "passage: " prefix for documents being indexed
    prefixed = [f"passage: {t}" for t in texts]
    vectors = model.encode(prefixed, normalize_embeddings=True)

    return {
        "ok": True,
        "vectors": vectors.tolist(),
    }


def cmd_embed_query(req: dict) -> dict:
    """
    Generates an embedding for a single search query.
    Uses "query: " prefix (different from passage encoding in e5 models).
    """
    text = req.get("text", "")
    if not text:
        return {"ok": False, "error": "text is required"}

    model = _get_embed_model()
    vector = model.encode(f"query: {text}", normalize_embeddings=True)

    return {
        "ok": True,
        "vector": vector.tolist(),
    }


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

COMMANDS = {
    "health": cmd_health,
    "extract": cmd_extract,
    "embed": cmd_embed,
    "embed_query": cmd_embed_query,
}


def main():
    # Force UTF-8 on stdout/stdin — critical on Windows where the default is cp1252
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)  # type: ignore[attr-defined]
    sys.stdin.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    # Stderr can be read by the parent for debug logging
    sys.stderr.write("[cortx-extractor] started\n")
    sys.stderr.flush()

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue

        req_id = None
        try:
            req = json.loads(raw_line)
            req_id = req.get("id")
            cmd = req.get("cmd")

            if cmd == "shutdown":
                _send({"id": req_id, "ok": True, "data": {"bye": True}})
                break

            handler = COMMANDS.get(cmd)
            if handler is None:
                _send({"id": req_id, "ok": False, "error": f"Unknown command: {cmd}"})
                continue

            result = handler(req)
            _send({"id": req_id, **result})

        except json.JSONDecodeError as e:
            _send({"id": req_id, "ok": False, "error": f"Invalid JSON: {e}"})
        except Exception as e:
            _send({"id": req_id, "ok": False, "error": str(e), "traceback": traceback.format_exc()})


def _send(obj: dict):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
