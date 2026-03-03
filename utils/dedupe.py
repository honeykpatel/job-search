def dedupe_jobs(jobs: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for j in jobs:
        key = (j.get("url") or "").strip()
        if not key:
            key = "|".join(
                [
                    str(j.get("source") or "").strip().lower(),
                    str(j.get("company") or "").strip().lower(),
                    str(j.get("title") or "").strip().lower(),
                    str(j.get("location") or "").strip().lower(),
                ]
            )
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(j)
    return out
