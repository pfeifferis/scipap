import os
import re
import fitz  # PyMuPDF
from typing import Dict, List, Optional, Tuple, Any

def get_pdf_metadata(pdf_path: str) -> Dict[str, Any]:
    """Extract page count, dimensions, and metadata title from PDF."""
    doc = fitz.open(pdf_path)
    metadata = doc.metadata or {}
    pages_info = []
    
    for i, page in enumerate(doc):
        rect = page.rect
        pages_info.append({
            "page_number": i + 1,
            "width": float(rect.width),
            "height": float(rect.height),
        })
        
    title = metadata.get("title", "")
    doc.close()
    
    return {
        "num_pages": len(pages_info),
        "title": title.strip() if title else None,
        "pages": pages_info
    }


def extract_text_for_llm(pdf_path: str, max_pages: int = 60) -> str:
    """
    Extract readable text with explicit page markers so the LLM
    can cite exact pages and verbatim quotes.
    """
    doc = fitz.open(pdf_path)
    formatted_pages = []
    
    total_pages = min(len(doc), max_pages)
    for i in range(total_pages):
        page = doc[i]
        text = page.get_text("text")
        cleaned_text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text).strip()
        formatted_pages.append(f"=== [PAGE {i + 1}] ===\n{cleaned_text}")
        
    doc.close()
    return "\n\n".join(formatted_pages)


def _merge_word_rects_by_line(word_items: List[Tuple[float, float, float, float, str, int, int, int]]) -> List[List[float]]:
    """
    Group matched word rects into consolidated line rectangles.
    word_item: (x0, y0, x1, y1, word, block_no, line_no, word_no)
    """
    if not word_items:
        return []

    lines_dict: Dict[Tuple[int, int], List[Tuple[float, float, float, float]]] = {}
    for w in word_items:
        line_key = (w[5], w[6])  # (block_no, line_no)
        if line_key not in lines_dict:
            lines_dict[line_key] = []
        lines_dict[line_key].append((w[0], w[1], w[2], w[3]))

    merged_rects = []
    for (blk, lno), rects in lines_dict.items():
        x0 = min(r[0] for r in rects)
        y0 = min(r[1] for r in rects)
        x1 = max(r[2] for r in rects)
        y1 = max(r[3] for r in rects)
        # Add slight padding for visual readability
        merged_rects.append([float(x0 - 2), float(y0 - 1), float(x1 + 2), float(y1 + 1)])

    return merged_rects


def _fuzzy_word_search_on_page(page: fitz.Page, search_tokens: List[str]) -> Optional[List[List[float]]]:
    """
    Performs word-level fuzzy sequence search using page.get_text('words').
    Tolerates line breaks, hyphens, and slight punctuation variances.
    """
    if len(search_tokens) < 2:
        return None

    page_words = page.get_text("words")
    if not page_words:
        return None

    # Clean words on page for comparison: lowercase alphanumeric
    cleaned_page_tokens = [re.sub(r'[^\w]', '', w[4].lower()) for w in page_words]
    target_len = len(search_tokens)

    best_match_start = -1
    best_match_len = 0
    best_match_score = 0.0

    # Try window lengths from target_len down to max(3, target_len - 2)
    for window_size in [target_len, min(target_len, 8), min(target_len, 5)]:
        if window_size < 2:
            continue
        sub_target = search_tokens[:window_size]

        for i in range(len(cleaned_page_tokens) - window_size + 1):
            window = cleaned_page_tokens[i:i + window_size]
            matches = sum(1 for a, b in zip(sub_target, window) if a == b and len(a) > 0)
            score = matches / float(window_size)

            if score >= 0.8 and matches >= 2:
                if score > best_match_score or (score == best_match_score and window_size > best_match_len):
                    best_match_score = score
                    best_match_start = i
                    best_match_len = window_size

        if best_match_score >= 0.85:
            break

    if best_match_start >= 0 and best_match_score >= 0.75:
        matched_word_items = page_words[best_match_start : best_match_start + best_match_len]
        return _merge_word_rects_by_line(matched_word_items)

    return None


def find_quote_location(
    pdf_path: str,
    quote: Optional[str] = None,
    hint_page: Optional[int] = None,
    fallback_value: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Search for a citation quote or value in the PDF and return its
    exact page number, bounding boxes (rects), and page dimensions.
    Employs 5 progressive search strategies:
    1. Exact full quote match
    2. Sub-phrase chunks & sliding window
    3. Normalized whitespace & hyphenation handling
    4. Fuzzy word-sequence matching via page.get_text('words')
    5. Fallback search using extracted value itself
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    if total_pages == 0:
        doc.close()
        return None

    # Priority page ordering: check hint_page first
    pages_to_check = []
    if hint_page and 1 <= hint_page <= total_pages:
        pages_to_check.append(hint_page)
    for p in range(1, total_pages + 1):
        if p not in pages_to_check:
            pages_to_check.append(p)

    def format_result(page_num: int, rect_list: List[fitz.Rect] | List[List[float]], matched_text: str):
        page = doc[page_num - 1]
        p_width = float(page.rect.width)
        p_height = float(page.rect.height)
        
        # Normalize rects to float lists
        final_rects = []
        for r in rect_list:
            if isinstance(r, (list, tuple)):
                final_rects.append([float(r[0]), float(r[1]), float(r[2]), float(r[3])])
            else:
                final_rects.append([float(r.x0), float(r.y0), float(r.x1), float(r.y1)])

        doc.close()
        return {
            "page": page_num,
            "rects": final_rects,
            "page_width": p_width,
            "page_height": p_height,
            "matched_quote": matched_text
        }

    search_targets: List[str] = []

    # 1. Prepare candidates from quote
    if quote and len(quote.strip()) >= 3:
        cleaned_quote = quote.strip()
        if (cleaned_quote.startswith('"') and cleaned_quote.endswith('"')) or \
           (cleaned_quote.startswith("'") and cleaned_quote.endswith("'")):
            cleaned_quote = cleaned_quote[1:-1].strip()

        search_targets.append(cleaned_quote)

        # Sub-phrases
        words = cleaned_quote.split()
        if len(words) >= 8:
            search_targets.append(" ".join(words[:10]))
            search_targets.append(" ".join(words[:6]))
            search_targets.append(" ".join(words[2:8]))
            search_targets.append(" ".join(words[-8:]))
        elif len(words) >= 4:
            search_targets.append(" ".join(words[:5]))
            search_targets.append(" ".join(words[-4:]))

    # 2. Strategy 1 & 2: PyMuPDF exact search for each candidate
    for target_text in search_targets:
        if len(target_text) < 3:
            continue
        for page_num in pages_to_check:
            page = doc[page_num - 1]
            rects = page.search_for(target_text)
            if rects:
                return format_result(page_num, rects, target_text)

    # 3. Strategy 3 & 4: Word-level fuzzy sequence search across pages
    if search_targets:
        primary_quote = search_targets[0]
        # Clean quote tokens: lowercase alphanumeric
        quote_tokens = [re.sub(r'[^\w]', '', w.lower()) for w in primary_quote.split()]
        quote_tokens = [t for t in quote_tokens if t]

        if len(quote_tokens) >= 2:
            for page_num in pages_to_check:
                page = doc[page_num - 1]
                fuzzy_rects = _fuzzy_word_search_on_page(page, quote_tokens)
                if fuzzy_rects:
                    return format_result(page_num, fuzzy_rects, primary_quote)

    # 4. Strategy 5: Fallback search using the extracted value itself
    if fallback_value and len(str(fallback_value).strip()) >= 3:
        val_str = str(fallback_value).strip()
        # Remove markdown quotes or bullet prefixes if present
        val_clean = re.sub(r'^[-*•\s]+', '', val_str).strip()
        val_clean = re.sub(r'["\']', '', val_clean).strip()

        # Generate candidates from value (e.g., DOI, Year, Author surname, key numbers)
        val_candidates = [val_clean]
        val_words = val_clean.split()
        if len(val_words) >= 3:
            val_candidates.append(" ".join(val_words[:4]))
        elif len(val_words) == 1:
            val_candidates.append(val_words[0])

        for v_cand in val_candidates:
            if len(v_cand) < 3:
                continue
            for page_num in pages_to_check:
                page = doc[page_num - 1]
                v_rects = page.search_for(v_cand)
                if v_rects:
                    return format_result(page_num, v_rects, v_cand)

    doc.close()
    return None


def search_pdf_keywords(
    pdf_path: str,
    query: str,
    case_sensitive: bool = False
) -> Dict[str, Any]:
    """
    Search a PDF file for occurrences of a keyword or phrase.
    Returns total matches, list of matches with page numbers,
    exact bounding box rects, page dimensions, and context snippets.
    """
    if not os.path.exists(pdf_path) or not query or not query.strip():
        return {"query": query or "", "total_matches": 0, "matches": []}

    clean_q = query.strip()
    words = clean_q.split()
    flags = fitz.TEXT_CASE_SENSITIVE if case_sensitive else 0

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return {"query": clean_q, "total_matches": 0, "matches": [], "error": str(e)}

    total_pages = len(doc)
    results = []
    match_id = 0

    for page_idx in range(total_pages):
        page = doc[page_idx]
        p_width = float(page.rect.width)
        p_height = float(page.rect.height)
        page_num = page_idx + 1

        rects = page.search_for(clean_q, flags=flags)
        if not rects:
            continue

        i = 0
        while i < len(rects):
            cur_rects = [rects[i]]
            # Group continuation rect if multi-word query wraps to next line
            if len(words) > 1 and i + 1 < len(rects):
                r1 = rects[i]
                r2 = rects[i + 1]
                if 0 <= (r2.y0 - r1.y0) <= 30 and r2.y1 > r1.y1:
                    cur_rects.append(r2)
                    i += 1

            r_first = cur_rects[0]
            r_last = cur_rects[-1]
            clip_rect = fitz.Rect(0, max(0, r_first.y0 - 15), p_width, min(p_height, r_last.y1 + 15))
            raw_snippet = page.get_text("text", clip=clip_rect)
            snippet = " ".join(raw_snippet.split()) if raw_snippet else clean_q
            if len(snippet) > 160:
                snippet = snippet[:157] + "..."

            results.append({
                "id": match_id,
                "page": page_num,
                "rects": [[float(r.x0), float(r.y0), float(r.x1), float(r.y1)] for r in cur_rects],
                "page_width": p_width,
                "page_height": p_height,
                "snippet": snippet
            })
            match_id += 1
            i += 1

    doc.close()
    return {
        "query": clean_q,
        "total_matches": len(results),
        "matches": results
    }

