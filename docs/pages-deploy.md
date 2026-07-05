# GitHub Pages deploy — architecture & gotchas

How the live site gets deployed, and the failure modes that have already cost
debugging round-trips. Verified 2026-07-05.

## Deploy paths

- Pages source is **GitHub Actions** (repo Settings → Pages, since 2026-07-05).
  The only deploy pipeline is `.github/workflows/pages.yml` (push to main +
  `workflow_dispatch`). It stamps the `sw.js` CACHE_NAME with the short SHA
  before uploading, so a deploy from any other pipeline would ship an
  unstamped service worker.
- Before 2026-07-05 the source was "Deploy from a branch": GitHub's built-in
  Jekyll workflow ("pages build and deployment", `dynamic` event) ran on every
  push — bot pushes included — and raced `pages.yml`, deploying an unstamped,
  Jekyll-processed copy whenever it finished last. If checks named
  "pages build and deployment (dynamic)" ever reappear, the Pages source
  setting has regressed to branch mode.

## Bot data commits need an explicit dispatch

The four data workflows (`daily-forex-update`, `twrr-refresh`,
`analysis-sync`, `update-vt-sectors`) push with `GITHUB_TOKEN` and a skip-ci
marker, so their pushes trigger **no** push workflows — the deploy included.
Each therefore ends with a "Trigger Pages deploy" step that runs
`gh workflow run pages.yml --ref main` (requires `actions: write`; the
`workflow_dispatch` API is exempt from the GITHUB_TOKEN no-retrigger rule),
gated on a commit actually having been pushed (`changes_detected` output of
git-auto-commit-action, or the hand-set `pushed` output in `twrr-refresh`).
Removing that step doesn't fail anything — it silently leaves the live site's
data stale until the next human push.

## Gotchas that already bit

- **A skip-ci marker anywhere in the head commit message** — body included,
  even quoted in prose — makes GitHub skip ALL push workflows, deploy
  included, with no error anywhere. The `.husky/commit-msg` hook now blocks
  it in local commits (`ALLOW_SKIP_CI=1 git commit ...` to bypass
  intentionally; runner-side bot commits are unaffected because husky isn't
  installed there).
- **Re-running only the failed deploy job** fails with `Multiple artifacts
named "github-pages"` — every attempt uploads another artifact into the
  same run. Re-run _all_ jobs, or just push again.
- "Deployment failed, try again later." (annotation on the deploy job) is a
  generic GitHub-backend rejection, not a repo problem — it hit both the
  legacy and Actions pipelines repeatedly in early July 2026 with a 33 MB
  artifact and all systems green on githubstatus. `pages.yml` now retries the
  deploy step once automatically; if both attempts fail, re-dispatch before
  digging.

## Debugging Actions without `gh` auth

`gh` is typically unauthenticated on this machine; the repo is public, so
plain `curl` works (unauthenticated rate limit: 60 req/hr):

```bash
# Runs of one workflow / all runs for one commit
curl -s "https://api.github.com/repos/ryusoh/fund/actions/workflows/pages.yml/runs?per_page=15"
curl -s "https://api.github.com/repos/ryusoh/fund/actions/runs?head_sha=<full-sha>"

# Step-level results, then the actual failure text
curl -s "https://api.github.com/repos/ryusoh/fund/actions/runs/<run-id>/jobs"
curl -s "https://api.github.com/repos/ryusoh/fund/check-runs/<job-id>/annotations"
```

The Pages settings endpoint (`/repos/ryusoh/fund/pages`) 404s without auth —
infer deploy behaviour from run history instead.
