import feedparser

REMOTEOK_RSS = "https://remoteok.com/remote-jobs.rss"

def search_remoteok(job_title: str, k: int = 5):
    feed = feedparser.parse(REMOTEOK_RSS)
    results = []
    q = job_title.lower().strip()

    for e in feed.entries:
        title = (e.get("title") or "").strip()
        link = (e.get("link") or "").strip()
        summary = (e.get("summary") or "").strip()

        text = (title + " " + summary).lower()
        if q and q not in text:
            continue

        results.append(
            {"title": title, "company": None, "location": "Remote", "url": link, "source": "RemoteOK"}
        )
        if len(results) >= k:
            break

    return results