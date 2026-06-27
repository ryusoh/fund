"""Sync commands from .claude/commands and .gemini/commands to .agents/skills."""

import os
import re
import shutil
from typing import Dict, Tuple

# Constants
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLAUDE_DIR = os.path.join(WORKSPACE_ROOT, ".claude", "commands")
GEMINI_DIR = os.path.join(WORKSPACE_ROOT, ".gemini", "commands")
SKILLS_DIR = os.path.join(WORKSPACE_ROOT, ".agents", "skills")


def parse_toml(content: str) -> Tuple[str, str]:
    """Parse legacy Gemini CLI command TOML structure without external dependencies."""
    # Try double quotes first
    desc_match = re.search(r'description\s*=\s*"(.*?)"', content)
    if not desc_match:
        # Try single quotes
        desc_match = re.search(r"description\s*=\s*'(.*?)'", content)
    description = desc_match.group(1) if desc_match else ""

    # Find prompt = '''...''' or prompt = """..."""
    prompt_match = re.search(r"prompt\s*=\s*'''(.*?)'''", content, re.DOTALL)
    if not prompt_match:
        prompt_match = re.search(r'prompt\s*=\s*"""(.*?)"""', content, re.DOTALL)
    prompt = prompt_match.group(1).strip() if prompt_match else ""

    return description, prompt


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
    """Main execution block to sync commands."""
    # Ensure target directory exists and is clean
    if os.path.exists(SKILLS_DIR):
        shutil.rmtree(SKILLS_DIR)
    os.makedirs(SKILLS_DIR, exist_ok=True)

    imported_names = set()

    # Process .gemini/commands/ (TOML format) - preferred for Gemini-based Antigravity CLI
    if os.path.exists(GEMINI_DIR):
        for entry in os.listdir(GEMINI_DIR):
            if entry.endswith(".toml"):
                file_path = os.path.join(GEMINI_DIR, entry)
                skill_name = entry[:-5]
                imported_names.add(skill_name)

                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()

                description, prompt = parse_toml(content)

                skill_dir = os.path.join(SKILLS_DIR, skill_name)
                os.makedirs(skill_dir, exist_ok=True)

                skill_md_path = os.path.join(skill_dir, "SKILL.md")
                with open(skill_md_path, "w", encoding="utf-8") as f:
                    f.write("---\n")
                    f.write(f"name: {skill_name}\n")
                    f.write(f"description: {description}\n")
                    f.write("---\n\n")
                    f.write(prompt)
                    f.write("\n")

    # Process .claude/commands/ (Markdown format) - fallback for commands not in .gemini/
    if os.path.exists(CLAUDE_DIR):
        for entry in os.listdir(CLAUDE_DIR):
            if entry.endswith(".md"):
                file_path = os.path.join(CLAUDE_DIR, entry)
                skill_name = entry[:-3]

                # Skip if already imported from Gemini
                if skill_name in imported_names:
                    continue

                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()

                yaml_data, body = parse_markdown(content)
                description = yaml_data.get("description", "")
                arg_hint = yaml_data.get("argument-hint", "")

                skill_dir = os.path.join(SKILLS_DIR, skill_name)
                os.makedirs(skill_dir, exist_ok=True)

                skill_md_path = os.path.join(skill_dir, "SKILL.md")
                with open(skill_md_path, "w", encoding="utf-8") as f:
                    f.write("---\n")
                    f.write(f"name: {skill_name}\n")
                    f.write(f"description: {description}\n")
                    if arg_hint:
                        f.write(f"argument-hint: {arg_hint}\n")
                    f.write("---\n\n")
                    f.write(body)
                    f.write("\n")

    print("Successfully synchronized Claude and Gemini commands to Antigravity skills.")


if __name__ == "__main__":
    main()
