#!/bin/bash
# A script to run tests locally

echo "Running tests..."

# Install dependencies from the project's virtual environment
../venv/bin/pip install -r ../requirements.txt

# Run tests using the project's virtual environment
../venv/bin/pytest ..

echo "Tests finished."
