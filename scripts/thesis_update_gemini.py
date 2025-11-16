#!/usr/bin/env python3
"""CLI helper to run the Thesis Update Task prompt against Gemini."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import List, Optional

try:
    import google.generativeai as genai
except ImportError as exc:  # pragma: no cover - handled at runtime
    raise SystemExit(
        "Unable to import google-generativeai. Install it with `pip install google-generativeai`.\n"
        f"Original error: {exc}"
    ) from exc


REPO_ROOT = Path(__file__).resolve().parents[1]
PROMPT_TEMPLATE_PATH = REPO_ROOT / "docs" / "thesis_update_prompt.md"


def read_text(path: Path, required: bool = True) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    if required:
        raise FileNotFoundError(f"Required file not found: {path}")
    return ""


def build_prompt(
    ticker: str,
    mode: str,
    thesis_text: str,
    json_text: str,
    new_material_text: str,
    evidence_sections: List[str],
) -> str:
    template = read_text(PROMPT_TEMPLATE_PATH)
    evidence_block = "\n".join(evidence_sections) if evidence_sections else "None."
    return f"""You are an investment research assistant. Follow the Thesis Update Task specification exactly.

{template}

MODE: "{mode}"
TICKER: {ticker}

--- Thesis file (docs/thesis/{ticker}.md) ---
{thesis_text}

--- Scenario JSON (data/analysis/{ticker}.json) ---
{json_text}

--- Evidence files ---
{evidence_block}

--- New material (docs/thesis/{ticker}/{ticker}-input.md or inbox) ---
{new_material_text}
"""


def collect_evidence(ticker: str) -> List[str]:
    paths = [
        REPO_ROOT / "docs" / "thesis" / ticker / f"{ticker}-bull-evidence.md",
        REPO_ROOT / "docs" / "thesis" / ticker / f"{ticker}-base-evidence.md",
        REPO_ROOT / "docs" / "thesis" / ticker / f"{ticker}-bear-evidence.md",
        REPO_ROOT / "docs" / "thesis" / ticker / f"{ticker}-inbox.md",
    ]
    sections: List[str] = []
    for path in paths:
        if path.exists():
            sections.append(f"### {path}\n{read_text(path)}")
    return sections


def resolve_new_material(ticker: str, override: Optional[str]) -> Path:
    if override:
        return REPO_ROOT / override
    candidates = [
        REPO_ROOT / "docs" / "thesis" / ticker / f"{ticker}-input.md",
        REPO_ROOT / "docs" / "thesis" / ticker / f"{ticker}-inbox.md",
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError(
        "Could not find new material file. Provide one via --new-file or create "
        "docs/thesis/{ticker}/{ticker}-input.md (or -inbox.md)."
    )


def call_gemini(
    prompt_text: str,
    model_name: str,
    temperature: float,
    max_output_tokens: int,
    allow_unsafe: bool,
    safety_settings_override: Optional[List[genai.types.SafetySetting]] = None,
) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)
    safety_settings = safety_settings_override
    if safety_settings is None and allow_unsafe:
        safety_settings = []
        safety_setting_cls = getattr(genai.types, "SafetySetting", None)
        harm_category_enum = getattr(genai.types, "HarmCategory", None)
        if safety_setting_cls and harm_category_enum:
            for category in harm_category_enum:
                safety_settings.append(
                    safety_setting_cls(category=category, threshold="BLOCK_NONE")
                )
        else:
            safety_settings = None

    model = genai.GenerativeModel(model_name, safety_settings=safety_settings)
    response = model.generate_content(
        prompt_text,
        generation_config=genai.types.GenerationConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        ),
        safety_settings=safety_settings,
    )

    texts: List[str] = []
    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", []) if content else []
        for part in parts:
            text = getattr(part, "text", None)
            if text:
                texts.append(text)

    if texts:
        return "\n".join(texts).strip()

    diagnostics = []
    candidates = getattr(response, "candidates", []) or []
    for idx, candidate in enumerate(candidates):
        finish_reason = getattr(candidate, "finish_reason", "")
        safety = getattr(candidate, "safety_ratings", [])
        ratings = ", ".join(
            f"{getattr(rating, 'category', '?')}={getattr(rating, 'probability', '?')}"
            for rating in safety or []
        )
        diagnostics.append(f"candidate[{idx}] finish_reason={finish_reason} safety={ratings}")
    diag_msg = "; ".join(diagnostics) or "No candidates returned."
    raise RuntimeError("Gemini response did not contain usable text. Diagnostics: " f"{diag_msg}")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the Thesis Update Task prompt via Gemini.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("ticker", help="Ticker symbol (e.g. ANET, OXY)")
    parser.add_argument(
        "mode",
        nargs="?",
        choices=("interpret", "patch", "auto"),
        default="auto",
        help="Prompt mode (defaults to auto)",
    )
    parser.add_argument(
        "--model",
        default="gemini-2.5-pro",
        help="Gemini model to use",
    )
    parser.add_argument(
        "--new-file",
        help="Override path (relative to repo root) for the new input material",
    )
    parser.add_argument(
        "--output",
        help="Optional path to save the raw model response",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.4,
        help="Generation temperature",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=2048,
        help="Maximum output tokens",
    )
    parser.add_argument(
        "--enforce-safety",
        dest="allow_unsafe",
        action="store_false",
        help="Enforce Gemini safety filters (by default safety is relaxed).",
    )
    parser.set_defaults(allow_unsafe=True)
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    ticker = args.ticker.upper()
    print(
        f"[info] Running Thesis Update Task for {ticker} (mode={args.mode}, "
        f"allow_unsafe={'yes' if args.allow_unsafe else 'no'})"
    )
    thesis_path = REPO_ROOT / "docs" / "thesis" / f"{ticker}.md"
    json_path = REPO_ROOT / "data" / "analysis" / f"{ticker}.json"
    new_material_path = resolve_new_material(ticker, args.new_file)

    print(f"[info] Loading thesis markdown: {thesis_path}")
    thesis_text = read_text(thesis_path)
    print(f"[info] Loading scenario JSON: {json_path}")
    json_text = read_text(json_path)
    print(f"[info] Loading new material: {new_material_path}")
    new_material_text = read_text(new_material_path)
    evidence_sections = collect_evidence(ticker)
    if evidence_sections:
        print("[info] Found evidence files:")
        for section in evidence_sections:
            header = section.splitlines()[0]
            print(f"        {header}")
    else:
        print("[info] No evidence files found.")

    prompt_text = build_prompt(
        ticker,
        args.mode,
        thesis_text,
        json_text,
        new_material_text,
        evidence_sections,
    )

    try:
        print(f"[info] Calling Gemini model '{args.model}' (temperature={args.temperature})...")
        output_text = call_gemini(
            prompt_text,
            args.model,
            args.temperature,
            args.max_output_tokens,
            args.allow_unsafe,
        )
    except Exception as exc:  # pragma: no cover - runtime error path
        raise SystemExit(f"Gemini API call failed: {exc}") from exc

    print(output_text)
    if args.output:
        out_path = Path(args.output)
        out_path.write_text(output_text, encoding="utf-8")
        print(f"\nSaved response to {out_path}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
