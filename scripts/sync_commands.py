"""Sync commands from .claude/commands to .agents/skills.

`.claude/commands/*.md` is the canonical source; `.agents/skills/` is generated
for the Antigravity CLI. `.gemini/commands/` is legacy Gemini CLI config (that
CLI is deprecated in favour of Antigravity) — this script no longer reads or
writes it, so those files are frozen and edited by hand if ever needed.
"""

import os
import shutil
import subprocess
from typing import Dict, Tuple

# Constants
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLAUDE_DIR = os.path.join(WORKSPACE_ROOT, ".claude", "commands")
SKILLS_DIR = os.path.join(WORKSPACE_ROOT, ".agents", "skills")


def parse_markdown(content: str) -> Tuple[Dict[str, str], str]:
    """Parse Claude markdown command frontmatter and body."""
    yaml_data: Dict[str, str] = {}
    body = ""

    # Split by frontmatter delimiters
    parts = content.split("---", 2)
    if len(parts) >= 3:
        yaml_block = parts[1]
        body = parts[2].strip()
        for line in yaml_block.splitlines():
            if ":" in line:
                key, val = line.split(":", 1)
                yaml_data[key.strip()] = val.strip().strip('"').strip("'")
    else:
        body = content.strip()

    return yaml_data, body


def main() -> None:
    """Regenerate .agents/skills from the canonical .claude/commands sources."""
    # Ensure target directory exists and is clean
    if os.path.exists(SKILLS_DIR):
        shutil.rmtree(SKILLS_DIR)
    os.makedirs(SKILLS_DIR, exist_ok=True)

    if os.path.exists(CLAUDE_DIR):
        for entry in sorted(os.listdir(CLAUDE_DIR)):
            if not entry.endswith(".md"):
                continue

            file_path = os.path.join(CLAUDE_DIR, entry)
            skill_name = entry[:-3]

            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            yaml_data, body = parse_markdown(content)
            description = yaml_data.get("description", "")
            arg_hint = yaml_data.get("argument-hint", "")

            # Antigravity skills use {{args}} placeholders; Claude uses $ARGUMENTS.
            body = body.replace("$ARGUMENTS", "{{args}}")

            skill_dir = os.path.join(SKILLS_DIR, skill_name)
            os.makedirs(skill_dir, exist_ok=True)

            skill_md_path = os.path.join(skill_dir, "SKILL.md")
            with open(skill_md_path, "w", encoding="utf-8") as f:
                f.write("---\n")
                f.write(f"name: {skill_name}\n")
                f.write(f"description: {description}\n")
                if arg_hint:
                    # Quote as a YAML string: values often start with `[`/`<`,
                    # which a bare scalar would parse as an array/tag, not a string.
                    safe_hint = arg_hint.replace("\\", "\\\\").replace('"', '\\"')
                    f.write(f'argument-hint: "{safe_hint}"\n')
                f.write("---\n\n")
                f.write(body)
                f.write("\n")

    format_generated_skills()

    print("Successfully synchronized Claude commands to Antigravity skills.")


def format_generated_skills() -> None:
    """Format generated skills with prettier so output matches the pre-commit hook.

    Without this, the lint-staged prettier pass reformats the generated Markdown
    after it lands, so a fresh sync always shows phantom drift against the
    committed files. Mirror the hook's exact invocation to keep sync idempotent.
    Degrade gracefully if prettier/npx is unavailable (script stays stdlib-only).
    """
    try:
        subprocess.run(
            ["npx", "prettier", "--write", "--ignore-path", ".prettierignore", SKILLS_DIR],
            cwd=WORKSPACE_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        print("Warning: npx not found; skipping prettier formatting of generated skills.")
    except subprocess.CalledProcessError as exc:
        print(f"Warning: prettier failed on generated skills:\n{exc.stderr}")


if __name__ == "__main__":
    main()
