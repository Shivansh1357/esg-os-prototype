import os
import sys

# Ensure the service root (this directory) is importable as the `app` package
# regardless of how pytest is invoked (`pytest` console script vs `python -m pytest`).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
