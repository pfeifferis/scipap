import json
import re
import asyncio
import time
from typing import Dict, List, Optional, Any
import httpx

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_BATCH_URL = "https://openrouter.ai/api/beta/batches"

DEFAULT_EXTRACTION_SYSTEM_PROMPT = """You are a precision scientific literature extraction system.
Your mission is to extract structured variables from research papers and link EVERY extracted finding directly to its exact textual citation(s) in the paper.

MANDATORY RULES:
1. Grounding Guarantee: For EVERY single field where `value` is extracted (not null), you MUST supply verbatim citation quote(s) and page number(s).
2. Class Suggestions: Where "Suggested classes" are listed in a field's description, use them as guidance to classify accurately when applicable, or formulate a specific finding/value if the study reports different or more detailed information.
3. Distribution Breakdown: For distribution breakdown fields (such as `density_measure` and `tumor_type_distribution`), ALWAYS extract the complete breakdown with both raw counts and percentage numbers in % (e.g. `BI-RADS A: 16 (20.3%), B: 44 (55.7%), C: 11 (13.9%), D: 3 (3.8%)` or `Invasive Ductal: 49 (84.5%), DCIS: 9 (15.5%)`). If percentages are reported in tables/text or easily computed from category totals, provide the exact `%`.
4. Multiple Citations: When an extracted data point is evidenced across multiple sentences, paragraphs, tables, or pages (e.g., patient inclusion criteria, study design, or diagnostic endpoints across different settings), provide multiple citation objects in the `citations` array.
5. Verbatim Fidelity: Every `quote` MUST be an exact character-for-character copy-paste of a continuous text snippet (between 5 and 30 consecutive words) directly from the text.
   - NEVER paraphrase, summarize, or alter words, punctuation, or numbers in quotes.
   - For short fields (e.g. publication_year: "2024", first_author: "Smith", doi, or total cases), copy the complete phrase or clause where that fact appears.
6. Page Identification: Use the `=== [PAGE X] ===` demarcation headers to determine the exact integer `page` number (e.g., 1, 2, 3).
7. If a field is truly not mentioned, not evaluated, or not applicable in the paper, set `value` to "NR" (Not Reported), `quote` to null, and `page` to null.
8. Output format MUST be strictly a JSON object conforming to the schema.
"""

def fix_unescaped_newlines_in_json(s: str) -> str:
    """Escapes raw literal unescaped newlines, tabs, and carriage returns that occur inside JSON string literals."""
    res = []
    in_string = False
    escape = False
    for ch in s:
        if ch == "\\" and in_string:
            escape = not escape
            res.append(ch)
            continue
        elif ch == '"' and not escape:
            in_string = not in_string
            res.append(ch)
        elif in_string and ch == "\n":
            res.append("\\n")
        elif in_string and ch == "\r":
            res.append("\\r")
        elif in_string and ch == "\t":
            res.append("\\t")
        else:
            res.append(ch)
        escape = False
    return "".join(res)


def extract_field_objects_regex(text: str) -> List[Dict[str, Any]]:
    """Robust regex-based fallback to extract all field objects even if the outer JSON is malformed or unescaped."""
    matches = []
    keys = list(re.finditer(r'"field_key"\s*:\s*"([a-zA-Z0-9_]+)"', text))
    for i, km in enumerate(keys):
        k = km.group(1)
        start_idx = text.rfind("{", 0, km.start())
        if start_idx == -1:
            continue
        if i < len(keys) - 1:
            next_start = text.rfind("{", 0, keys[i + 1].start())
            block = text[start_idx:next_start].rstrip().rstrip(",")
        else:
            block = text[start_idx:text.rfind("}") + 1] if text.rfind("}") != -1 else text[start_idx:]

        val_m = re.search(r'"value"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|null|(true|false|[0-9.-]+))', block)
        quote_m = re.search(r'"quote"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|null)', block)
        page_m = re.search(r'"page"\s*:\s*(\d+|null)', block)
        conf_m = re.search(r'"confidence"\s*:\s*([0-9.]+|null)', block)

        val = val_m.group(1) if (val_m and val_m.group(1) is not None) else (val_m.group(2) if val_m else None)
        quote = quote_m.group(1) if (quote_m and quote_m.group(1) is not None) else None
        page = int(page_m.group(1)) if (page_m and page_m.group(1) and page_m.group(1) != "null") else None
        conf = float(conf_m.group(1)) if (conf_m and conf_m.group(1) and conf_m.group(1) != "null") else 1.0

        matches.append({
            "field_key": k,
            "value": val,
            "quote": quote,
            "page": page,
            "citations": [{"quote": quote, "page": page}] if (quote and page) else [],
            "confidence": conf
        })
    return matches


def parse_json_extractions(raw_content: str) -> List[Dict[str, Any]]:
    """Parse JSON array or object from raw LLM output, with robust multi-tiered fallback & repair."""
    raw = raw_content.strip()

    # 1. Clean markdown code fences if present
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*(?:```|$)', raw)
    clean_text = match.group(1).strip() if match else raw

    # Sanitize non-printable control characters except standard whitespace
    sanitized_text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', clean_text)
    fixed_text = fix_unescaped_newlines_in_json(sanitized_text)

    # 2. Try direct parse
    for text_candidate in (sanitized_text, fixed_text, clean_text):
        for strict in (False, True):
            try:
                parsed = json.loads(text_candidate, strict=strict)
                if isinstance(parsed, dict) and "extractions" in parsed and isinstance(parsed["extractions"], list):
                    return parsed["extractions"]
                elif isinstance(parsed, list):
                    return parsed
            except Exception:
                pass

    # 3. Try completing truncated JSON array/object
    for suffix in [']}', '"}', '"]}', 'null}]}', 'null}]', '}']:
        try:
            repaired = fixed_text + suffix
            parsed = json.loads(repaired, strict=False)
            if isinstance(parsed, dict) and "extractions" in parsed and isinstance(parsed["extractions"], list):
                return parsed["extractions"]
            elif isinstance(parsed, list):
                return parsed
        except Exception:
            continue

    # 4. Fallback: Parse individual complete extraction objects with JSONDecoder(strict=False).raw_decode
    decoder = json.JSONDecoder(strict=False)
    salvaged = []
    pos = 0
    while True:
        idx = fixed_text.find('"field_key"', pos)
        if idx == -1:
            break
        brace_idx = fixed_text.rfind('{', 0, idx)
        if brace_idx != -1:
            try:
                obj, end_idx = decoder.raw_decode(fixed_text, brace_idx)
                if isinstance(obj, dict) and "field_key" in obj:
                    salvaged.append(obj)
                    pos = end_idx
                    continue
            except Exception:
                pass
        pos = idx + len('"field_key"')

    # 5. Fallback: Regex extraction
    regex_salvaged = extract_field_objects_regex(sanitized_text)

    # Pick whichever recovered more field keys
    best_salvaged = regex_salvaged if len(regex_salvaged) > len(salvaged) else salvaged

    if best_salvaged:
        print(f"[REPAIR] Salvaged {len(best_salvaged)} extraction items from LLM response (raw_decode: {len(salvaged)}, regex: {len(regex_salvaged)}).", flush=True)
        return best_salvaged

    raise ValueError(f"Could not parse valid JSON from LLM response: {raw[:300]}...")


def build_user_prompt(fields_desc: str, paper_text: str) -> str:
    return f"""Extract the following fields from the research paper text.

FIELDS TO EXTRACT:
{fields_desc}

PAPER TEXT (Demarcated with === [PAGE X] === markers):
--------------------------------------------------
{paper_text}
--------------------------------------------------

CRITICAL EXTRACTION & CITATION REQUIREMENTS:
- MANDATORY: You MUST return an extraction entry for EVERY requested field listed above.
- If a field is truly not evaluated, not reported, or not applicable in the paper, output "value": "NR", "quote": null, "page": null, "citations": [].
- For every non-null (non-NR) value, provide exact, continuous verbatim citation quote(s) and page number(s).
- Multiple Citations: If an extracted point is evidenced across multiple sentences, tables, or pages, include all of them in the "citations" array!
- Class Suggestions: Where suggested classes are indicated in the field description, use them as classification guidance or specify exact details reported.
- Do NOT paraphrase quotes. They will be searched character-by-character to highlight the exact text in the PDF viewer.

Return ONLY valid JSON matching this schema:
{{
  "extractions": [
    {{
      "field_key": "<exact key from list>",
      "value": "<extracted finding, or \"NR\" if not reported in paper>",
      "quote": "<primary verbatim quote, or null if NR>",
      "page": <primary integer page number, or null if NR>,
      "citations": [
        {{
          "quote": "<exact verbatim quote from text>",
          "page": <integer page number where quote appears>
        }}
      ],
      "confidence": <float 0.0 - 1.0>
    }}
  ]
}}
"""



async def extract_multiple_papers_batch(
    api_key: str,
    model: str,
    papers_data: List[Dict[str, Any]], # [{"paper_id": int, "paper_text": str}]
    fields: List[Dict[str, Any]],
    system_prompt: Optional[str] = None
) -> Dict[int, List[Dict[str, Any]]]:
    """
    Submits multiple papers simultaneously either as a single multi-request OpenRouter Batch job
    (for 50% discount) or via concurrent asynchronous requests.
    Returns { paper_id: [extractions] }.
    """
    if not api_key:
        raise ValueError("OpenRouter API key is missing. Please provide an API key in Settings.")

    if not papers_data:
        return {}

    chosen_model = model or "google/gemini-2.5-flash-lite:batch"
    
    fields_desc_lines = []
    for f in fields:
        line = f"- key: \"{f['key']}\" | label: \"{f['label']}\" | description: \"{f.get('description', '')}\""
        if f.get("options"):
            line += f" | PREDEFINED CLASSES (choose one if applicable or specify custom): {json.dumps(f['options'])}"
        fields_desc_lines.append(line)
    fields_desc = "\n".join(fields_desc_lines)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/pfeifferis/scipap",
        "X-Title": "SciPap - Paper Extraction Tool",
    }

    results_by_id: Dict[int, List[Dict[str, Any]]] = {}

    async with httpx.AsyncClient(timeout=300.0) as client:
        # If model specifies :batch, try submitting all papers in a single OpenRouter Batch array
        if ":batch" in chosen_model:
            try:
                base_model = chosen_model.replace(":batch", "")
                batch_req = {
                    "model": base_model,
                    "endpoint": "/v1/chat/completions",
                    "requests": [
                        {
                            "custom_id": str(item["paper_id"]),
                            "body": {
                                "model": chosen_model,
                                "messages": [
                                    {"role": "system", "content": system_prompt or DEFAULT_EXTRACTION_SYSTEM_PROMPT},
                                    {"role": "user", "content": build_user_prompt(fields_desc, item["paper_text"])}
                                ],
                                "temperature": 0.1,
                                "response_format": {"type": "json_object"},
                                "max_tokens": 16000
                            }
                        }
                        for item in papers_data
                    ]
                }

                print(f"[BATCH] Submitting {len(papers_data)} paper(s) to OpenRouter Batch API ({chosen_model})...", flush=True)
                resp = await client.post(OPENROUTER_BATCH_URL, headers=headers, json=batch_req)
                print(f"[BATCH] Response status: {resp.status_code}", flush=True)
                if resp.status_code in (200, 201, 202):
                    batch_info = resp.json()
                    batch_id = batch_info.get("id")
                    print(f"[BATCH] Batch successfully registered! ID = {batch_id}. Starting polling loop...", flush=True)
                    if batch_id:
                        poll_url = f"{OPENROUTER_BATCH_URL}/{batch_id}"
                        start_time = time.time()
                        poll_count = 0
                        while time.time() - start_time < 360:
                            await asyncio.sleep(3)
                            poll_count += 1
                            poll_resp = await client.get(poll_url, headers=headers)
                            if poll_resp.status_code == 200:
                                p_data = poll_resp.json()
                                b_status = p_data.get("status")
                                print(f"[BATCH] Poll #{poll_count} ({int(time.time() - start_time)}s elapsed): Status = {b_status}", flush=True)
                                if b_status == "completed":
                                    output_list = p_data.get("results") or p_data.get("output", [])
                                    print(f"[BATCH] Batch completed! Processing {len(output_list)} result(s)...", flush=True)
                                    for out_item in output_list:
                                        c_id = out_item.get("custom_id")
                                        if c_id and c_id.isdigit():
                                            p_id = int(c_id)
                                            body = out_item.get("response", {}).get("body", {})
                                            content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
                                            if content:
                                                try:
                                                    results_by_id[p_id] = parse_json_extractions(content)
                                                    print(f"[BATCH] Successfully parsed {len(results_by_id[p_id])} items for paper {p_id}.", flush=True)
                                                except Exception as ex:
                                                    print(f"[BATCH ERROR] Error parsing JSON for paper {p_id}: {ex}", flush=True)
                                    return results_by_id
                                elif b_status in ("failed", "cancelled"):
                                    print(f"[BATCH ERROR] OpenRouter batch ended with status '{b_status}'", flush=True)
                                    break
                else:
                    print(f"[BATCH WARNING] OpenRouter Batch endpoint returned {resp.status_code}: {resp.text}. Falling back to standard API.", flush=True)
            except Exception as e:
                print(f"[BATCH ERROR] Batch API encountered error: {e}. Falling back to standard API...", flush=True)

        # Fallback: Parallel extraction using asyncio.gather
        fallback_model = chosen_model.replace(":batch", "")
        sem = asyncio.Semaphore(5)

        async def extract_single(item: Dict[str, Any]):
            async with sem:
                pid = item["paper_id"]
                p_text = item["paper_text"]
                try:
                    print(f"[LLM] Extracting paper {pid} ({fallback_model})...", flush=True)
                    res = await extract_paper_data(
                        api_key=api_key,
                        model=fallback_model,
                        paper_text=p_text,
                        fields=fields,
                        system_prompt=system_prompt
                    )
                    results_by_id[pid] = res
                except Exception as ex:
                    print(f"Exception extracting paper {pid}: {ex}", flush=True)

        await asyncio.gather(*[extract_single(item) for item in papers_data])
        return results_by_id


async def _extract_single_chunk(
    client: httpx.AsyncClient,
    headers: dict,
    model: str,
    paper_text: str,
    fields_chunk: List[Dict[str, Any]],
    system_prompt: Optional[str]
) -> List[Dict[str, Any]]:
    fields_desc_lines = []
    for f in fields_chunk:
        line = f"- key: \"{f['key']}\" | label: \"{f['label']}\" | description: \"{f.get('description', '')}\""
        if f.get("options"):
            line += f" | PREDEFINED CLASSES (choose one if applicable or specify custom): {json.dumps(f['options'])}"
        fields_desc_lines.append(line)
    fields_desc = "\n".join(fields_desc_lines)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt or DEFAULT_EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(fields_desc, paper_text)}
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "max_tokens": 16000
    }

    try:
        r = await client.post(OPENROUTER_CHAT_URL, headers=headers, json=payload)
        if r.status_code != 200:
            print(f"[EXTRACT ERROR] OpenRouter API error ({r.status_code}): {r.text}", flush=True)
            return []
        raw = r.json()["choices"][0]["message"]["content"].strip()
        return parse_json_extractions(raw)
    except Exception as e:
        print(f"[EXTRACT ERROR] Chunk extraction failed: {e}", flush=True)
        return []


async def extract_paper_data(
    api_key: str,
    model: str,
    paper_text: str,
    fields: List[Dict[str, Any]],
    system_prompt: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Single paper extraction using parallel focused chunks for maximum accuracy and 100% field coverage."""
    chosen_model = (model or "google/gemini-2.5-flash-lite").replace(":batch", "")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/pfeifferis/scipap",
        "X-Title": "SciPap - Paper Extraction Tool",
    }

    CHUNK_SIZE = 18
    chunks = [fields[i:i + CHUNK_SIZE] for i in range(0, len(fields), CHUNK_SIZE)]

    async with httpx.AsyncClient(timeout=240.0) as client:
        print(f"[EXTRACT] Extracting {len(fields)} fields across {len(chunks)} parallel chunks (~{CHUNK_SIZE} fields each) on {chosen_model}...", flush=True)
        tasks = [
            _extract_single_chunk(client, headers, chosen_model, paper_text, chunk, system_prompt)
            for chunk in chunks
        ]
        chunk_results = await asyncio.gather(*tasks)

        all_raw_items = []
        for res in chunk_results:
            all_raw_items.extend(res)

        item_map: Dict[str, Dict[str, Any]] = {}
        for item in all_raw_items:
            if isinstance(item, dict) and "field_key" in item:
                item_map[item["field_key"]] = item

        # Enforce schema completeness: preserve explicit LLM extractions (including explicit "NR" / "NA"),
        # and leave omitted/unevaluated fields as None (not yet extracted).
        complete_extractions: List[Dict[str, Any]] = []
        for f in fields:
            f_key = f["key"]
            if f_key in item_map:
                complete_extractions.append(item_map[f_key])
            else:
                complete_extractions.append({
                    "field_key": f_key,
                    "value": None,
                    "quote": None,
                    "page": None,
                    "citations": [],
                    "confidence": 0.0
                })

        return complete_extractions





