"""Sync commands from .agents/skills to .claude/commands.

`.agents/skills/<name>/SKILL.md` is the canonical source — the open Agent
Skills format, read natively by Antigravity, Kimi, and Codex.
`.claude/commands/*.md` is generated from it for Claude Code. Edit the
SKILL.md files, never the generated commands; `make sync-check` fails the
gate if the generated copy is stale.
"""

import os
import shutil
import subprocess
from typing import Dict, Tuple

# Constants
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS_DIR = os.path.join(WORKSPACE_ROOT, ".agents", "skills")
CLAUDE_DIR = os.path.join(WORKSPACE_ROOT, ".claude", "commands")


def parse_markdown(content: str) -> Tuple[Dict[str, str], str]:
    """Parse SKILL.md frontmatter and body."""
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
    """Regenerate .claude/commands from the canonical .agents/skills sources."""
    # Ensure target directory exists and is clean
    if os.path.exists(CLAUDE_DIR):
        shutil.rmtree(CLAUDE_DIR)
    os.makedirs(CLAUDE_DIR, exist_ok=True)

    if os.path.exists(SKILLS_DIR):
        for entry in sorted(os.listdir(SKILLS_DIR)):
            skill_dir = os.path.join(SKILLS_DIR, entry)
            skill_md_path = os.path.join(skill_dir, "SKILL.md")
            if not os.path.isdir(skill_dir) or not os.path.exists(skill_md_path):
                continue

            with open(skill_md_path, "r", encoding="utf-8") as f:
                content = f.read()

            yaml_data, body = parse_markdown(content)
            description = yaml_data.get("description", "")
            arg_hint = yaml_data.get("argument-hint", "")

            # Agent Skills use {{args}} placeholders; Claude uses $ARGUMENTS.
            body = body.replace("{{args}}", "$ARGUMENTS")

            command_path = os.path.join(CLAUDE_DIR, f"{entry}.md")
            with open(command_path, "w", encoding="utf-8") as f:
                f.write("---\n")
                f.write(f"description: {description}\n")
                if arg_hint:
                    # Quote as a YAML string: values often start with `[`/`<`,
                    # which a bare scalar would parse as an array/tag, not a string.
                    safe_hint = arg_hint.replace("\\", "\\\\").replace('"', '\\"')
                    f.write(f'argument-hint: "{safe_hint}"\n')
                f.write("---\n\n")
                f.write(body)
                f.write("\n")

    format_generated_commands()

    print("Successfully synchronized Agent Skills to Claude commands.")


def format_generated_commands() -> None:
    """Format generated commands with prettier so output matches the pre-commit hook.

    Without this, the lint-staged prettier pass reformats the generated Markdown
    after it lands, so a fresh sync always shows phantom drift against the
    committed files. Mirror the hook's exact invocation to keep sync idempotent.
    Degrade gracefully if prettier/npx is unavailable (script stays stdlib-only).
    """
    try:
        subprocess.run(
            ["npx", "prettier", "--write", "--ignore-path", ".prettierignore", CLAUDE_DIR],
            cwd=WORKSPACE_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        print("Warning: npx not found; skipping prettier formatting of generated commands.")
    except subprocess.CalledProcessError as exc:
        print(f"Warning: prettier failed on generated commands:\n{exc.stderr}")


if __name__ == "__main__":
    main()
