"""Score the baseline experiment.
Usage: python3 05_score.py 02_test_set.csv 04_scoring_sheet.csv
Rows with an empty verdict are treated as not yet run and are skipped.
"""
import csv, sys
from collections import defaultdict

GUIDE_IDS = {"TERM-01","TERM-02","TERM-03","TONE-01","TONE-02","TONE-03","CLAIM-01","CLAIM-02",
             "CLAIM-03","FACT-01","ACC-01","ACC-02","ACC-03","ACC-04","FMT-01","LEGAL-01"}

key = {r["piece_id"]: r for r in csv.DictReader(open(sys.argv[1], encoding="utf-8"))}
runs = [r for r in csv.DictReader(open(sys.argv[2], encoding="utf-8"))]
scored = [r for r in runs if r["verdict"].strip()]

print(f"Rows scored: {len(scored)} of {len(runs)}")
if not scored:
    sys.exit("Nothing scored yet.")

parse_fail = sum(1 for r in scored if r["verdict"].strip() == "PARSE_FAIL")
uncited = sum(int(r["uncited_findings"] or 0) for r in scored)
invented = sum(int(r["invented_rules"] or 0) for r in scored)

by_piece = defaultdict(dict)
flagged = {}
for r in scored:
    pid, run = r["piece_id"], int(r["run_no"])
    by_piece[pid][run] = r["verdict"].strip()
    flagged[(pid, run)] = {x.strip() for x in r["flagged_rules"].split(";") if x.strip() and x.strip() != "NONE"}

changed = [p for p, v in by_piece.items() if len(set(v.values())) > 1]

req_total = 0
detected_per_run = defaultdict(int)
missed_all_runs = []
false_pos = []
for pid, k in key.items():
    req = {x for x in k["required_rules"].split(";") if x}
    if k["expected_flag"] == "Y":
        req_total += len(req) * len(by_piece.get(pid, {}))
        union = set()
        for run in by_piece.get(pid, {}):
            hit = req & flagged[(pid, run)]
            detected_per_run[run] += len(hit)
            union |= hit
        if by_piece.get(pid) and (req - union):
            missed_all_runs.append((pid, sorted(req - union)))
    else:
        for run, v in by_piece.get(pid, {}).items():
            if v == "FLAG":
                false_pos.append((pid, run))

print(f"PARSE_FAIL rows: {parse_fail}")
print(f"Findings with no rule cited: {uncited}")
print(f"Findings citing a rule not in the guide: {invented}")
print(f"Pieces with a verdict change across runs: {len(changed)} {sorted(changed)}")
print(f"Planted-violation rule instances (all scored runs): {req_total}")
for run in sorted(detected_per_run):
    print(f"  Run {run}: rule instances detected = {detected_per_run[run]}")
print(f"Planted rules missed in every run: {missed_all_runs if missed_all_runs else 'none'}")
print(f"False positives on clean controls (FLAG runs): {len(false_pos)} {false_pos}")
