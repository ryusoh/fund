#!/bin/bash
# Fund CLI alias setup

set -euo pipefail

FUND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

generate_alias_block() {
  cat << 'EOF'
# Add these to your ~/.bashrc, ~/.zshrc, or ~/.profile for permanent setup:

# Remove conflicting aliases if present
unalias fund 2>/dev/null || true
unalias portfolio 2>/dev/null || true
unalias holdings 2>/dev/null || true
unalias buy 2>/dev/null || true
unalias sell 2>/dev/null || true
unalias update-fund 2>/dev/null || true
unalias p 2>/dev/null || true
unalias h 2>/dev/null || true
unalias uf 2>/dev/null || true

# Fund CLI functions (compatible with argcomplete)
fund() { "__FUND_DIR__/bin/fund" "$@"; }
portfolio() { "__FUND_DIR__/bin/portfolio" "$@"; }
holdings() { "__FUND_DIR__/bin/holdings" "$@"; }
buy() { "__FUND_DIR__/bin/holdings" buy "$@"; }
sell() { "__FUND_DIR__/bin/holdings" sell "$@"; }
update_fund() { "__FUND_DIR__/bin/update-all" "$@"; }

# Backwards-compatible aliases
alias update-fund=update_fund

# Short aliases
alias p=portfolio
alias h=holdings
alias uf=update_fund

# Functions for quick trading
fundby() { "__FUND_DIR__/bin/holdings" buy "$@"; }
fundsl() { "__FUND_DIR__/bin/holdings" sell "$@"; }
fundls() { "__FUND_DIR__/bin/portfolio"; }

# Shell completion setup
if [ -n "\$ZSH_VERSION" ]; then
  # zsh: use a native fallback completer to avoid eval of #compdef blocks
  autoload -U compinit 2>/dev/null && compinit
  autoload -U bashcompinit 2>/dev/null && bashcompinit
  _fund_complete() {
    local cmdline suggestions
    if (( CURRENT > 1 )); then
      cmdline="${words[2,-1]}"
    else
      cmdline=""
    fi
    suggestions=(${(@f)$("__FUND_DIR__/bin/fund" complete-debug "$cmdline" 2>/dev/null)})
    compadd -- $suggestions
  }
  compdef _fund_complete fund
else
  # bash: try argcomplete registration
  if command -v register-python-argcomplete >/dev/null 2>&1; then
    eval "\$(register-python-argcomplete fund)"
  else
    eval "\$(python -m argcomplete.register-python-argcomplete fund 2>/dev/null)" || true
  fi
fi
EOF
}

print_alias_block() {
  # Replace placeholder with absolute repo path
  generate_alias_block | sed "s|__FUND_DIR__|$FUND_DIR|g"
}

usage() {
  cat << USAGE
Usage: $0 [--eval|--install|--uninstall]

  --eval       Print alias/function definitions only (for eval/redirect)
  --install    Append or update aliases in your shell rc (auto-detects zsh/bash)
  --uninstall  Remove previously installed Fund aliases from your shell rc

If no flag is provided, this script prints the alias block and interactively
offers to install it into your shell rc.
USAGE
}

install_to_rc() {
  local shell_name rc_file tmp_file marker_start marker_end
  shell_name="$(basename "${SHELL:-zsh}")"

  if [[ "$shell_name" == "zsh" ]]; then
    rc_file="${ZDOTDIR:-$HOME}/.zshrc"
  elif [[ "$shell_name" == "bash" ]]; then
    rc_file="$HOME/.bashrc"
  else
    # default to zshrc
    rc_file="${ZDOTDIR:-$HOME}/.zshrc"
  fi

  marker_start="# >>> fund aliases >>>"
  marker_end="# <<< fund aliases <<<"
  tmp_file="$(mktemp)"

  # Build the block with markers
  {
    echo "$marker_start"
    generate_alias_block | sed "s|__FUND_DIR__|$FUND_DIR|g"
    echo "$marker_end"
  } > "$tmp_file"

  mkdir -p "$(dirname "$rc_file")"
  touch "$rc_file"

  if grep -qF "$marker_start" "$rc_file" >/dev/null 2>&1; then
    # Replace existing block between markers using awk; read replacement from repl file
    awk -v start="$marker_start" -v end="$marker_end" -v repl="$tmp_file" '
      BEGIN { inside = 0 }
      {
        if ($0 == start) {
          inside = 1; print;
          # print replacement block excluding the first (start marker) line
          i = 0;
          while ((getline line < repl) > 0) {
            i++;
            if (i == 1) { continue }
            print line
          }
          close(repl);
          next
        }
        if ($0 == end) { inside = 0; next }
        if (!inside) print
      }
    ' "$rc_file" > "$rc_file.tmp" && mv "$rc_file.tmp" "$rc_file"
    echo "Updated aliases in $rc_file"
  else
    # Check for existing 'fund' alias outside markers
    if grep -qE "^alias fund=" "$rc_file" >/dev/null 2>&1; then
      echo "Found an existing 'fund' alias in $rc_file."
      read -r -p "Replace it with Fund aliases block? [y/N] " REPLACE
      case "$REPLACE" in
        [yY][eE][sS]|[yY])
          # Remove existing fund alias lines
          sed -E '/^alias fund=/d' "$rc_file" > "$rc_file.tmp" && mv "$rc_file.tmp" "$rc_file"
          ;;
        *)
          echo "Keeping existing alias; appending Fund aliases block as well."
          ;;
      esac
    fi
    # Append new block
    {
      echo ""
      cat "$tmp_file"
    } >> "$rc_file"
    echo "Appended aliases to $rc_file"
  fi

  rm -f "$tmp_file"
  echo "Restart your shell or run: source \"$rc_file\""
}

uninstall_from_rc() {
  local shell_name rc_file marker_start marker_end
  shell_name="$(basename "${SHELL:-zsh}")"
  if [[ "$shell_name" == "zsh" ]]; then
    rc_file="${ZDOTDIR:-$HOME}/.zshrc"
  else
    rc_file="$HOME/.bashrc"
  fi
  marker_start="# >>> fund aliases >>>"
  marker_end="# <<< fund aliases <<<"

  if [[ -f "$rc_file" ]]; then
    awk -v start="$marker_start" -v end="$marker_end" 'BEGIN{inside=0} {
      if ($0==start) {inside=1; next}
      if ($0==end) {inside=0; next}
      if (!inside) print
    }' "$rc_file" > "$rc_file.tmp" && mv "$rc_file.tmp" "$rc_file"
    echo "Removed aliases from $rc_file"
  else
    echo "No rc file found at $rc_file"
  fi
}

case "${1-}" in
  -h|--help)
    usage; exit 0;;
  --eval)
    print_alias_block; exit 0;;
  --install)
    install_to_rc; exit 0;;
  --uninstall)
    uninstall_from_rc; exit 0;;
esac

if [[ "${1-}" == "--eval" ]]; then
  # Print only alias/function definitions for eval or appending to rc files
  print_alias_block
  exit 0
fi

echo "Setting up Fund CLI aliases..."
print_alias_block

echo "\nCopy the aliases above to your shell config file."
echo ""
echo "Quick start (without permanent setup):"
echo "   ./bin/fund --help         # Main CLI"
echo "   ./bin/portfolio           # Show portfolio"
echo "   ./bin/holdings list       # Same as above"
echo "   ./bin/holdings buy AAPL 10 150.50"
echo "   ./bin/holdings sell AAPL 5 155.00"
echo "   ./bin/update-all          # Update all data"
echo ""
echo "After adding aliases, you can use:"
echo "   fund forex            # Update forex"
echo "   portfolio             # Show holdings"
echo "   buy AAPL 10 150.50    # Quick buy"
echo "   sell AAPL 5 155.00    # Quick sell"
echo "   p                     # Short portfolio view"
echo "   fundby AAPL 10 150.50 # Function-based buy (works from anywhere)"
echo ""
echo "Alias setup complete."

# Interactive prompt to install
read -r -p "\nInstall these aliases into your shell rc now? [y/N] " REPLY
case "$REPLY" in
  [yY][eE][sS]|[yY])
    install_to_rc
    ;;
  *)
    echo "Skipped installation. Use: $0 --install to add later."
    ;;
esac
