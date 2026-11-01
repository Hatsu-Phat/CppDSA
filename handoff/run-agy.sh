#!/usr/bin/env bash
# Usage: run-agy.sh T-XXXX [timeout]  — same prompt/model as ~/ai-workflow/run-task.ps1, without PowerShell stderr->error issue
T=$1; TO=${2:-150m}; cd /h/lab/CppDSA
P="Read GEMINI.md and AGENTS.md in the project root first. Then use the execute-task skill on handoff/tasks/$T.md. Only modify files listed under Allowed files. Write the report to handoff/reports/$T.md. Finish with exactly one line: STATUS: DONE or BLOCKED or FAILED."
agy -p "$P" --model gemini-3.8-flash-high --output-format json --print-timeout "$TO" > "handoff/reports/$T.run.json" 2> "handoff/reports/$T.agy-stderr.txt"
code=$?
echo "RUN task=$T exit=$code report_exists=$( [ -f handoff/reports/$T.md ] && echo True || echo False ) status=$(grep -o '"status":"[A-Z_]*"' handoff/reports/$T.run.json | head -1)"
tail -3 "handoff/reports/$T.agy-stderr.txt"
