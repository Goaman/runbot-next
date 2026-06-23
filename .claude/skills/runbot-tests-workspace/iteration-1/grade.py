import json, re, os

HERE = os.path.dirname(os.path.abspath(__file__))

# assertions per eval id: (text, regex, flags)
COMMON = [
    ("Identifies the latest batch 2549935", r"2549935", re.I),
    ("Identifies Enterprise Tests as the failing slot", r"enterprise\s*tests", re.I),
    ("Names the failing test test_custom_popup_snippet", r"test_custom_popup_snippet", re.I),
    ("Provides a reproduce command with --test-tags", r"--test-tags", re.I),
]
ASSERTIONS = {
    0: COMMON,
    1: COMMON,
    2: [
        ("States the batch did NOT pass", r"\b(did\s*not\s*pass|didn'?t\s*pass|not\s*pass|failed|fail|red|error)\b", re.I),
        ("Identifies Enterprise Tests as the failing slot", r"enterprise\s*tests", re.I),
        ("Names a failing test", r"test_custom_popup_snippet|test_10_website_conditional_visibility", re.I),
    ],
}

for eid, asserts in ASSERTIONS.items():
    for cfg in ("with_skill", "without_skill"):
        ans_path = os.path.join(HERE, f"eval-{eid}", cfg, "outputs", "answer.md")
        if not os.path.exists(ans_path):
            continue
        text = open(ans_path, encoding="utf-8", errors="ignore").read()
        expectations = []
        for label, pat, flags in asserts:
            m = re.search(pat, text, flags)
            expectations.append({
                "text": label,
                "passed": bool(m),
                "evidence": (m.group(0) if m else "not found in answer.md"),
            })
        passed = sum(1 for e in expectations if e["passed"])
        grading = {
            "run_id": f"eval-{eid}-{cfg}",
            "passed": passed,
            "total": len(expectations),
            "expectations": expectations,
        }
        out = os.path.join(HERE, f"eval-{eid}", cfg, "grading.json")
        json.dump(grading, open(out, "w"), indent=2)
        print(f"eval-{eid} {cfg}: {passed}/{len(expectations)}")
