import json, sys
try:
    runs = json.load(sys.stdin).get("workflow_runs", [])
except Exception:
    print("unknown"); raise SystemExit
ci = [r for r in runs if r.get("name") == "CI"]
if not ci:
    print("missing")
else:
    r = sorted(ci, key=lambda x: x["created_at"])[-1]
    print(r["conclusion"] if r["status"] == "completed" else "running")
