#!/usr/bin/env python3

import json
import os
import urllib.request
from pathlib import Path

import frontmatter


CONTENT_DIR = Path("content")
OUTPUT = Path("data/activity.json")

GITHUB_USER = "HalfTimeOfLife"

LANGUAGES = ["fr", "en"]


def github_get(url):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "HalfTimeOfLife-website",
    }

    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, headers=headers)

    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


def detect_language(filename):
    for lang in LANGUAGES[1:]:
        if filename.endswith(f".{lang}.md"):
            return lang
    return LANGUAGES[0]


def get_url(md_file):
    relative = md_file.parent.relative_to(CONTENT_DIR)
    parent_path = str(relative).replace("\\", "/")

    if md_file.stem.startswith("index"):
        return f"/{parent_path}/"

    name = md_file.stem
    for lang in LANGUAGES[1:]:
        if name.endswith(f".{lang}"):
            name = name[: -(len(lang) + 1)]
            break

    if md_file.parent == CONTENT_DIR:
        return f"/{name}/"

    return f"/{parent_path}/{name}/"


def scan_section(section, activity_type):
    result = []
    directory = CONTENT_DIR / section

    if not directory.exists():
        return result

    for md_file in directory.rglob("*.md"):
        if md_file.name.startswith("_"):
            continue

        lang = detect_language(md_file.name)
        post = frontmatter.load(md_file)
        title = post.get("title")
        date = post.get("date")

        if not title or not date:
            continue

        result.append(
            {
                "date": str(date)[:10],
                "type": activity_type,
                "title": title,
                "url": get_url(md_file),
                "lang": lang,
                "source": "hugo",
            }
        )

    return result


def scan_github_releases():
    releases = []
    try:
        repos = github_get(f"https://api.github.com/users/{GITHUB_USER}/repos")
    except Exception as e:
        print(f"GitHub error: {e}")
        return releases

    for repo in repos:
        if repo.get("fork") or repo.get("archived"):
            continue

        repo_name = repo["name"]
        try:
            repo_releases = github_get(
                f"https://api.github.com/repos/{GITHUB_USER}/{repo_name}/releases"
            )
        except Exception:
            continue

        if not repo_releases:
            continue

        release = repo_releases[0]
        if release.get("draft") or not release.get("published_at"):
            continue

        releases.append(
            {
                "date": release["published_at"][:10],
                "type": "release",
                "title": f"{repo_name} {release['tag_name']}",
                "url": release["html_url"],
                "repository": repo_name,
                "source": "github",
            }
        )

    releases.sort(key=lambda x: x["date"], reverse=True)
    return releases[:5]


def main():
    website = []
    website += scan_section("posts", "post")
    website += scan_section("projects", "project")
    website += scan_section("publications", "publication")

    github = scan_github_releases()

    website.sort(key=lambda x: x["date"], reverse=True)

    activity = {
        "website": website,
        "github": github,
    }

    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(
        json.dumps(activity, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Generated {OUTPUT} — {len(website)} website items, {len(github)} releases")


if __name__ == "__main__":
    main()
