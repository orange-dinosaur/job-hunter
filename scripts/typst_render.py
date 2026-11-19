# /// script
# requires-python = ">=3.11"
# dependencies = ["typst==0.15.2"]
# ///
"""Compile a Typst file to PDF using only the given font folder.

Usage: uv run --script scripts/typst_render.py <input.typ> <output.pdf> <font-dir>
"""

import sys

import typst

if __name__ == "__main__":
    source, output, fonts = sys.argv[1:4]
    typst.compile(source, output=output, font_paths=[fonts], ignore_system_fonts=True)
