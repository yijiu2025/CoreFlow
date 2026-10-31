# Git commits / releases / versions / branches

> **Scope**: the root repository (CoreFlow). The frontend repositories have their own release
> scripts (`release-web.mjs`) with the same decision rules but different channels.
>
> Tools in this repo:
>
> | Repository | Script | Channels |
> | --- | --- | --- |
> | CoreFlow (backend + npm packages) | `scripts/release.mjs` | git tag / GitHub Release / npm (`packages/log`) |

---

## 1. Commit convention (Conventional Commits)

### 1.1 Format

```
<type>(<scope>): <subject>

[optional body: explain *why*, especially pitfalls and decisions]

[optional footer]
```

- `subject` in any language, **≤ 72 characters**, no trailing period;
- one blank line between body and footer; footers look like `Key: value`.

### 1.2 Type table (only these prefixes count)

| type | Meaning | Triggers a release |
| --- | --- | --- |
| `feat` | new feature | ✅ minor |
| `fix` | bug fix | ✅ patch |
| `perf` | performance | ✅ patch |
| `refactor` | refactor, behaviour unchanged | ❌ |
| `docs` | documentation | ❌ |
| `test` | tests | ❌ |
| `chore` | dependencies, build config | ❌ |
| `style` | formatting | ❌ |
| `ci` | CI configuration | ❌ |
| `build` | build system | ❌ |
| `revert` | revert | ❌ |

> Anything else falls into `other` and **does not trigger a release**. A mistyped prefix means
> that commit is invisible to the release decision.

### 1.3 Scope

Scope names the **affected surface**, not the file name:

| Situation | Scope examples |
| --- | --- |
| Backend domains | `oauth21`, `user`, `admin`, `firewall` |
| Engineering | `ci`, `release`, `deps`, `build` |
| Cross-project | may be omitted, e.g. `chore: split oauth21 into its own repo` |

### 1.4 Breaking changes: footer form only

```
feat(api)!: require PKCE on the authorization endpoint

BREAKING CHANGE: /oauth/authorize no longer accepts requests without
code_challenge; clients must upgrade their SDK first.
```

- Detection regex: `/^BREAKING[ -]CHANGE:/m` — **line start plus colon**;
- 🔴 **Never relax this into a substring match**: merely *mentioning* the phrase in a body (for
  example when documenting this very rule) upgrades a minor release to major. This has happened
  in a real repository;
- The `!:` shorthand (`feat(api)!: …`) is equivalent to the footer; either one means major.

### 1.5 Sensitive words (release notes are public)

Commits whose title or body contains any of the following are listed separately by the release
script and need manual confirmation before publishing:

`vulnerability`, `leak`, `unauthorized`, `privilege escalation`, `injection`, `bypass`,
`CVE-*`, `token`, `secret`, `password`, `key`, `credential` —
plus their Chinese equivalents (`漏洞` / `泄露` / `密钥` / `凭证` …), which the script also matches.

For security fixes, title the commit “hardening” and keep the exploit details in the body
(bodies do not go into release notes).

---

## 2. Versions

### 2.1 Semantic versioning

```
v{major}.{minor}.{patch}
```

| Bump | Rule | Trigger |
| --- | --- | --- |
| major | `X+1.0.0` | breaking change (footer or `!:`) |
| minor | `X.Y+1.0` | any `feat` |
| patch | `X.Y.Z+1` | only `fix` / `perf` |
| — | no release | only chore/docs/test/style/ci/refactor/build/revert |

The baseline is the **latest tag** (use `--from <ref>` to replay or back-fill).

### 2.2 The tag is the version source; package.json follows

- 🔴 **Never derive the version from `package.json`** — the tag is the single source of truth;
- 🔴 **Alignment is done by the script, not by memory**: `--apply` writes the new version into
  the root `package.json` and **commits it separately** as `chore(release): X.Y.Z`, **then** tags —
  the order cannot be swapped, otherwise the tag points at a commit without the new version or
  CHANGELOG;
- dry-run only prints `will align package.json version a → b`, writing nothing.

> Why the order matters: a tag is an immutable pointer. Point it at a commit that has not updated
> the version and the `tag name == package.json version` invariant can never be satisfied again.

### 2.3 Tag naming and creation

- Format: `v1.2.3`, **always with the `v` prefix**;
- Must be **annotated** (`git tag -a`); the message is the human-readable changelog;
- Tags are pushed together with `main`; verify pushes with `git ls-remote`, **never trust the exit
  code** (silent “success” pushes have been observed on some setups);
- Delete a remote tag with `git push origin :refs/tags/vX.Y.Z` — only when it was pushed by
  mistake and no Release exists yet.

---

## 3. Branches

### 3.1 Overview

| Branch | Lifetime | Rules |
| --- | --- | --- |
| `main` | **the only long-lived branch** | the only branch releases come from; always deployable; no `git push --force` |
| `feature/*` | short-lived, deleted on merge | one topic per branch, cut from `main` |
| `hotfix/*` | short-lived | production emergencies; cut from the **tag that broke**, merged back into `main`, then a patch release |
| `docs/*`, `chore/*` | optional | documentation / chores, keeps feature names clean |

### 3.2 Main branch

- 🔴 **Releases only happen on `main`** (the script refuses anything else);
- Solo development with parallel work may leave uncommitted changes, but `--apply` then needs an
  explicit `--allow-dirty` (meaning: “what I want to release is committed, the rest belongs to
  another task”);
- Run the project's lint / test before committing — the last gate outside CI.

### 3.3 Topic branches

- Naming: `feature/<topic>`, `hotfix/<topic>`, lowercase with hyphens;
- **One branch, one purpose**; merge back into `main` immediately and delete the remote branch;
- Merge with `--no-ff` so the topology survives for changelog reading;
- Topic branches are **never tagged** — tags come from commits on `main`.

### 3.4 Repository family (since 2026-10-31: backend and frontend fully split)

The frontend projects are no longer nested directories in this repository:

| Repository | Remote | Relationship |
| --- | --- | --- |
| CoreFlow (this one) | `yijiu2025/CoreFlow` | backend only (`src/`, `migrations/`, `scripts/`, `docs/`) |
| oauth-web | `yijiu2025/oauth-web` | separate repo (the former `oauth21/` frontend) |
| other frontends | their own remotes | `posecraft` / `admin` / `poseadmin` / `firewall` / `phonecopy` |

- Frontend changes **do nothing here**: a clean checkout has no such directories;
- Each frontend repository **maintains its own tag line** (starting at `v1.0.0`, unrelated to this
  repository's versions);
- This repository's `.gitignore` keeps six **leading-slash** rules (`/oauth21/`, `/posecraft/`,
  `/admin/`, `/poseadmin/`, `/firewall/`, `/phonecopy/`) so that a local checkout holding both
  sides does not commit them accidentally. The leading slash is mandatory: a bare `oauth21/`
  would also ignore backend directories such as `src/api/oauth21/`, silently;
- `packages/theme-core` is still a **git submodule** (not a separate repo) — watch its pointer.

### 3.5 GitHub protections (once per repository)

1. `Settings → Branches → Add rule` for `main`: require a pull request before merging, block force
   pushes;
2. `Settings → General`: keep only the features you need (Issues / Releases / Discussions);
3. Push `main` once before enabling protections, otherwise rules on an empty repository have no
   effect.

---

## 4. Releasing (script usage)

### 4.1 Commands

```bash
# preview (default — writes nothing); run this before every release
node scripts/release.mjs

# execute: annotated tag + push main and tag + create the GitHub Release
node scripts/release.mjs --apply

# replay / back-fill from an explicit ref
node scripts/release.mjs --from v2.5.0

# allow uncommitted changes from parallel work (meaning: the release content is committed)
node scripts/release.mjs --apply --allow-dirty

# explicit bump level, for when the commit types do not imply one (prints an override warning)
node scripts/release.mjs --apply --kind patch
```

### 4.2 Script behaviour

1. **Dry-run by default**: irreversible actions (pushing tags, creating a public Release,
   `npm publish`) are always previewed first;
2. **Branch gate**: refuses anything but `main`;
3. **Dirty-worktree gate**: `--apply` refuses uncommitted changes unless `--allow-dirty`;
4. **Decision**: breaking → major; `feat` → minor; only `fix`/`perf` → patch; anything else → no
   release (`--kind` overrides explicitly and warns);
5. **Drift self-healing**: if a tag exists but its Release is missing, re-running the script
   creates it;
6. **Push verification**: after pushing, always confirm the remote SHA and tag with
   `git ls-remote` — **never trust the exit code**; the script then syncs local refs so
   `git status` does not report phantom “ahead”;
7. **Credentials**: GitHub token from `$GITHUB_TOKEN` / `$GH_TOKEN` / the git credential manager —
   no `gh` CLI needed;
8. **Sensitive words**: commit titles matching the list in 1.5 are printed for manual review;
9. **CHANGELOG promotion**: `--apply` turns the `## Unreleased` section into
   `## X.Y.Z — YYYY-MM-DD` and recreates an empty section (skipped, with a warning, when the
   section is empty or the file is missing);
10. **`package.json` alignment**: `--apply` writes the new version into `package.json` and syncs
    the root version in `package-lock.json` (only the two root occurrences — never third-party
    packages that happen to share the number).

### 4.3 Verifying a release

- CHANGELOG / `package.json` / lock are handled by the script — check the generated result;
- Read the Release page (especially any sensitive-word commits);
- Repositories publishing an image: wait for the image workflow and confirm both `<version>` and
  `latest` tags in the registry;
- If a push reports a remote mismatch: retry and re-check with `git ls-remote origin main` —
  **a timeout is not a failure**.

---

## 5. Common problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| A `feat` commit did not trigger a release | prefix not in the 1.2 table (e.g. `feature:`, `新增:`) | fix the prefix; amend if local, otherwise wait for the next commit |
| Minor was released as major | the body mentioned `BREAKING CHANGE:` outside the footer form | only line-start plus colon counts (1.4) |
| `git status` permanently reports ahead | this machine does not write loose refs | run the packed-refs sync tool with the remote SHA |
| Tag pushed but no Release | network drop / token timeout | re-run the same script; it back-fills |
| A nested-repo change never lands here | the commit was made in the root directory | `cd` into the nested repo and commit there |
