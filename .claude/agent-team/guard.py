#!/usr/bin/env python3
"""ai-dev-team tool guard (PreToolUse, PostToolUse and PostToolUseFailure hook).

What it enforces for the six ai-dev-team subagents
--------------------------------------------------
1. Write, Edit, MultiEdit, NotebookEdit: checked exactly BEFORE the call
   against the agent's write area, always-protected paths, the project's
   .claude/agent-team/protected-paths.txt and the optional per-task
   .claude/agent-team/scope.json. Violations are denied.
2. Bash, before the call: deploy, push, commit, history and branch-changing
   git commands and other dangerous commands are denied by pattern;
   read-only agents also get file-modifying commands denied by pattern.
3. Bash, after the call (PostToolUse and PostToolUseFailure): a REPOSITORY
   SAFEGUARD that does not depend on patterns. Before each subagent Bash call
   the guard snapshots the git working tree (all uncommitted files plus
   protected files that git ignores, such as .env). Afterwards it finds every
   file that changed and restores any change the agent was not allowed to
   make, then tells the agent what was reverted. Changes that the main session
   or another agent allowed to write that path made concurrently are not
   reverted (they are recorded in a small activity journal).

Fail-closed behavior
--------------------
* The hook command wrapper denies subagent calls when python3 or this file is
  missing, and when this script exits with anything other than 0 or 2.
* Hooks are installed with "onFailure": "block" (Claude Code 2.1.295+), so a
  crash or timeout also denies the call.
* Inside this script: unreadable input, an unreadable policy, a malformed
  scope.json, a Bash call outside a git repository, a snapshot that cannot be
  taken, or any unexpected error denies the call.
* The main session is not governed by this guard: its calls are allowed (and
  journaled so concurrent changes are attributed correctly).

Limits (documented, not hidden)
-------------------------------
* Only files inside the git checkout (plus protected ignored files) are
  restored. Writes elsewhere on disk, network side effects (HTTP requests,
  API calls), changes inside .git/, and processes left running in the
  background after the command returns are not reverted.
* A change is visible for the duration of the command before it is reverted.
* Files ignored by git that are not protected (build output, caches) are not
  restored.
* The guard defends against mistakes and overreach, not against an agent that
  deliberately rewrites the guard itself in the same command.

Modes: --shared-mode (project .claude/settings.json), --plugin-mode (plugin
hooks.json) and --agent NAME (testing). --post handles PostToolUse and
PostToolUseFailure.
Exit codes: 0 allow, 2 deny (pre) or "reverted / could not verify" (post).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
STATE_TTL_S = 3 * 3600
MAX_SNAPSHOT_BYTES = 200 * 1024 * 1024
MAX_IGNORED_DIR_FILES = 2000


# --------------------------------------------------------------------------- output
def block(reason: str) -> None:
    sys.stderr.write(f"[ai-dev-team guard] BLOCKED: {reason}\n")
    sys.exit(2)


def allow() -> None:
    sys.exit(0)


# --------------------------------------------------------------------------- globs
def glob_to_regex(pattern: str) -> re.Pattern:
    """Gitignore-like glob: '**' spans directories, '*' and '?' do not."""
    i, out = 0, []
    while i < len(pattern):
        c = pattern[i]
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif c == "*":
            out.append("[^/]*")
            i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(c))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def matches(rel_path: str, pattern: str) -> bool:
    pattern = pattern.strip()
    if not pattern:
        return False
    if pattern.endswith("/"):
        pattern += "**"
    if "/" not in pattern.rstrip("/"):
        return bool(glob_to_regex(pattern).match(rel_path.rsplit("/", 1)[-1]))
    return bool(glob_to_regex(pattern.lstrip("/")).match(rel_path))


def any_match(rel_path: str, patterns) -> str | None:
    for p in patterns:
        if matches(rel_path, p):
            return p
    return None


# --------------------------------------------------------------------------- roots
def find_root(start: Path) -> Path | None:
    """Nearest ancestor containing .git (a dir, or a file for worktrees)."""
    p = start if start.is_dir() else start.parent
    for candidate in [p, *p.parents]:
        if (candidate / ".git").exists():
            return candidate
    return None


def is_project_worktree(root: Path, proj: Path) -> bool:
    """True when root is a linked git worktree of the project repository."""
    git_file = root / ".git"
    if not git_file.is_file():
        return False
    try:
        line = git_file.read_text(encoding="utf-8").strip()
    except OSError:
        return False
    if not line.startswith("gitdir:"):
        return False
    gitdir = Path(line.split(":", 1)[1].strip())
    if not gitdir.is_absolute():
        gitdir = (root / gitdir).resolve()
    return (proj / ".git") in gitdir.parents


def project_root(payload: dict) -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env).resolve()
    cwd = payload.get("cwd") or os.getcwd()
    return find_root(Path(cwd).resolve()) or Path(cwd).resolve()


def read_lines(path: Path) -> list[str]:
    if not path.is_file():
        return []
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#"):
            lines.append(line)
    return lines


def protected_patterns(policy: dict, proj: Path, root: Path) -> list[str]:
    pats = list(policy.get("always_protected", []))
    pats += read_lines(proj / ".claude" / "agent-team" / "protected-paths.txt")
    if root != proj:
        pats += read_lines(root / ".claude" / "agent-team" / "protected-paths.txt")
    return pats


def agent_name(payload: dict, argv: list[str]) -> str | None:
    name = payload.get("agent_type")
    if not name and "--agent" in argv:
        idx = argv.index("--agent")
        if idx + 1 < len(argv):
            name = argv[idx + 1]
    if not name:
        return None
    return name.split(":")[-1]  # plugin agents are "ai-dev-team:<agent>"


# --------------------------------------------------------------------------- write policy
def resolve_target(raw: str, payload: dict, proj: Path) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = Path(payload.get("cwd") or proj) / path
    return Path(os.path.normpath(str(path)))


def write_violation(agent: str, rules: dict, policy: dict, path: Path, proj: Path) -> str | None:
    """Return a reason if `agent` may not write `path`, else None."""
    in_project = path == proj or proj in path.parents
    git_root = find_root(path)
    if not in_project and git_root is None:
        for tmp in policy.get("temp_dirs", []):
            if str(path).startswith(tmp.rstrip("/") + "/"):
                return None
        return f"{agent} may not write outside the project: {path}"
    if not in_project and git_root is not None and not is_project_worktree(git_root, proj):
        return f"{agent} may not write into another repository: {git_root}"
    root = git_root if git_root is not None and git_root != proj else proj
    rel = path.relative_to(root).as_posix()

    hit = any_match(rel, policy.get("always_protected", []))
    if hit:
        return f"{rel} is a protected configuration path ({hit}). Ask the orchestrator; only the user can approve this change."
    protected = read_lines(proj / ".claude" / "agent-team" / "protected-paths.txt")
    if root != proj:
        protected += read_lines(root / ".claude" / "agent-team" / "protected-paths.txt")
    hit = any_match(rel, protected)
    if hit:
        return f"{rel} is listed as approved/protected in protected-paths.txt ({hit}). Propose the change in your report instead."
    allowed = rules.get("write", [])
    if allowed != "project" and (not allowed or not any_match(rel, allowed)):
        return f"{agent} may only write to: {', '.join(allowed) if allowed else 'nothing (read-only agent)'}. Requested: {rel}"
    scope_file = proj / ".claude" / "agent-team" / "scope.json"
    if scope_file.is_file():
        try:
            scope = json.loads(scope_file.read_text(encoding="utf-8"))
        except Exception as exc:
            return f"scope.json is not valid JSON ({exc}); fix it before delegating writes"
        entry = scope.get(agent)
        if entry is not None and not any_match(rel, entry):
            return f"{rel} is outside the task scope assigned to {agent}: {', '.join(entry) or '(empty)'}"
    return None


# --------------------------------------------------------------------------- bash patterns
FS_COMMANDS = {"rm", "mv", "cp", "rmdir", "mkdir", "touch", "chmod", "truncate", "ln"}


def temp_only_segment(segment: str, temp_dirs: list[str]) -> bool:
    """True if the segment is a file-system command whose path arguments are all in temp dirs."""
    try:
        tokens = shlex.split(segment)
    except ValueError:
        return False
    while tokens and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[0]):
        tokens = tokens[1:]
    if not tokens or tokens[0] not in FS_COMMANDS:
        return False
    args = [a for a in tokens[1:] if not a.startswith("-")]
    prefixes = tuple(d.rstrip("/") + "/" for d in temp_dirs)
    return bool(args) and all(a.startswith(prefixes) for a in args)


def bash_pattern_violation(rules: dict, policy: dict, command: str) -> str | None:
    for item in policy.get("bash_blocked_all", []):
        if re.search(item["pattern"], command):
            return f"{item['reason']}. Command: {command[:200]}"
    if rules.get("bash") == "readonly":
        temp_dirs = policy.get("temp_dirs", [])
        segments = re.split(r"\n|;|&&|\|\||\|", command)
        remaining = "\n".join(s for s in segments if not temp_only_segment(s, temp_dirs))
        for item in policy.get("bash_blocked_readonly", []):
            if re.search(item["pattern"], remaining):
                return f"{item['reason']}. Command: {command[:200]}"
    return None


# --------------------------------------------------------------------------- state
def state_dir(proj: Path) -> Path:
    d = Path(tempfile.gettempdir()) / "ai-dev-team-guard" / hashlib.sha1(str(proj).encode()).hexdigest()[:12]
    (d / "snaps").mkdir(parents=True, exist_ok=True)
    (d / "active").mkdir(parents=True, exist_ok=True)
    return d


def prune(sd: Path) -> None:
    cutoff = time.time() - STATE_TTL_S
    for sub in ("active", "snaps"):
        for p in (sd / sub).iterdir():
            try:
                if p.stat().st_mtime < cutoff:
                    shutil.rmtree(p) if p.is_dir() else p.unlink()
            except OSError:
                pass
    journal = sd / "writes.jsonl"
    if journal.is_file() and journal.stat().st_size > 1_000_000:
        lines = [l for l in journal.read_text(encoding="utf-8").splitlines() if l.strip()]
        keep = [l for l in lines if json.loads(l).get("ts", 0) >= cutoff]
        journal.write_text("\n".join(keep) + ("\n" if keep else ""), encoding="utf-8")


def call_key(payload: dict) -> str:
    tid = payload.get("tool_use_id")
    if not tid:
        basis = f"{payload.get('agent_id')}|{json.dumps(payload.get('tool_input'), sort_keys=True)}"
        tid = hashlib.sha1(basis.encode()).hexdigest()
    return re.sub(r"[^A-Za-z0-9_.-]", "_", tid)[:120]


def journal_write(sd: Path, who: str, agent_id: str | None, path: Path) -> None:
    with open(sd / "writes.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps({"ts": time.time(), "agent": who, "agent_id": agent_id, "path": str(path)}) + "\n")


def record_active(sd: Path, key: str, who: str, agent_id: str | None) -> None:
    (sd / "active" / f"{key}.json").write_text(
        json.dumps({"agent": who, "agent_id": agent_id, "start": time.time(), "end": None}), encoding="utf-8")


def finish_active(sd: Path, key: str) -> None:
    p = sd / "active" / f"{key}.json"
    if p.is_file():
        rec = json.loads(p.read_text(encoding="utf-8"))
        rec["end"] = time.time()
        p.write_text(json.dumps(rec), encoding="utf-8")


# --------------------------------------------------------------------------- git snapshot
def git(root: Path, *args: str) -> bytes:
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=True, timeout=25).stdout


def git_toplevel(start: Path) -> Path | None:
    try:
        return Path(git(start, "rev-parse", "--show-toplevel").decode().strip())
    except Exception:
        return None


def _dec(b: bytes) -> str:
    return b.decode("utf-8", "surrogateescape")


def dirty_paths(root: Path) -> set[str]:
    out = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all")
    parts, res, i = out.split(b"\0"), set(), 0
    while i < len(parts):
        entry = parts[i]
        i += 1
        if len(entry) < 4:
            continue
        status, path = _dec(entry[:2]), _dec(entry[3:])
        res.add(path)
        if status[0] in "RC" and i < len(parts):
            res.add(_dec(parts[i]))
            i += 1
    return res


def protected_ignored(root: Path, patterns: list[str]) -> set[str]:
    out = git(root, "ls-files", "-z", "-o", "-i", "--exclude-standard", "--directory")
    res: set[str] = set()
    for raw in out.split(b"\0"):
        if not raw:
            continue
        rel = _dec(raw)
        if rel.endswith("/"):
            if any_match(rel + "x", patterns) or any_match(rel.rstrip("/"), patterns):
                count = 0
                for dirpath, _dirs, files in os.walk(root / rel):
                    for name in files:
                        res.add((Path(dirpath) / name).relative_to(root).as_posix())
                        count += 1
                        if count >= MAX_IGNORED_DIR_FILES:
                            break
                    if count >= MAX_IGNORED_DIR_FILES:
                        break
            continue
        if any_match(rel, patterns):
            res.add(rel)
    return res


def file_state(path: Path) -> dict:
    if path.is_symlink():
        return {"kind": "link", "target": os.readlink(path)}
    if not path.exists():
        return {"kind": "absent"}
    if path.is_dir():
        return {"kind": "dir"}
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return {"kind": "file", "sha": h.hexdigest()}


def take_snapshot(root: Path, proj: Path, policy: dict, sd: Path, key: str, agent: str, agent_id: str | None) -> None:
    pats = protected_patterns(policy, proj, root)
    paths = dirty_paths(root) | protected_ignored(root, pats)
    snap = sd / "snaps" / key
    shutil.rmtree(snap, ignore_errors=True)
    snap.mkdir(parents=True)
    files, total = {}, 0
    for i, rel in enumerate(sorted(paths)):
        f = root / rel
        st = file_state(f)
        if st["kind"] == "file":
            total += f.stat().st_size
            if total > MAX_SNAPSHOT_BYTES:
                shutil.rmtree(snap, ignore_errors=True)
                raise RuntimeError("too many uncommitted bytes to snapshot safely (over 200 MB); commit or stash first")
            shutil.copy2(f, snap / f"{i}.bin")
            st["copy"] = f"{i}.bin"
            st["mode"] = f.stat().st_mode & 0o777
        files[rel] = st
    try:
        head = git(root, "rev-parse", "HEAD").decode().strip()
    except Exception:
        head = None
    meta = {"root": str(root), "head": head, "files": files, "start": time.time(), "agent": agent, "agent_id": agent_id}
    (snap / "meta.json").write_text(json.dumps(meta), encoding="utf-8")


def restore(root: Path, rel: str, meta: dict, snap: Path) -> None:
    target = root / rel
    entry = meta["files"].get(rel)
    if target.is_dir() and not target.is_symlink():
        return  # never delete directories
    if target.is_symlink() or target.is_file():
        target.unlink()
    if entry is not None:
        if entry["kind"] == "file":
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(snap / entry["copy"], target)
            os.chmod(target, entry.get("mode", 0o644))
        elif entry["kind"] == "link":
            target.parent.mkdir(parents=True, exist_ok=True)
            os.symlink(entry["target"], target)
        return
    # Clean before the command: restore the committed version, or remove a new file.
    try:
        content = git(root, "show", f"HEAD:{rel}")
    except Exception:
        return  # did not exist in HEAD: the new file has been removed above
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    try:
        mode = git(root, "ls-tree", "HEAD", "--", rel).decode().split()[0]
        os.chmod(target, 0o755 if mode == "100755" else 0o644)
    except Exception:
        pass


def concurrent_writer(sd: Path, policy: dict, proj: Path, path: Path, key: str, start: float, agent_id: str | None) -> str | None:
    """Return who else may have made this change during [start, now], or None."""
    now = time.time()
    journal = sd / "writes.jsonl"
    if journal.is_file():
        for line in journal.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("path") == str(path) and start - 1 <= rec.get("ts", 0) <= now + 1:
                return f"{rec.get('agent')} via an approved Write/Edit"
    for p in (sd / "active").glob("*.json"):
        if p.stem == key:
            continue
        try:
            rec = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if rec.get("agent_id") and rec.get("agent_id") == agent_id:
            continue
        end = rec.get("end")
        if rec.get("start", now) > now + 1 or (end is not None and end < start - 1):
            continue
        who = rec.get("agent", "")
        if who == "main" or who.startswith("other:"):
            return f"{who} (running concurrently)"
        other_rules = policy.get("agents", {}).get(who)
        if other_rules is not None and write_violation(who, other_rules, policy, path, proj) is None:
            return f"{who} (running concurrently and allowed to write it)"
    return None


def emit_context(event: str, text: str) -> None:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": text}}))


def post_check(agent: str, rules: dict, policy: dict, payload: dict, proj: Path, sd: Path) -> None:
    key = call_key(payload)
    snap = sd / "snaps" / key
    event = payload.get("hook_event_name") or "PostToolUse"
    finish_active(sd, key)
    meta_file = snap / "meta.json"
    if not meta_file.is_file():
        emit_context(event, f"ai-dev-team guard could not find the pre-command snapshot for this {agent} command; "
                            "file changes were not verified. The orchestrator should review git status.")
        allow()
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    root = Path(meta["root"])
    try:
        head_now = git(root, "rev-parse", "HEAD").decode().strip()
    except Exception:
        head_now = None
    if head_now != meta.get("head"):
        shutil.rmtree(snap, ignore_errors=True)
        sys.stderr.write("[ai-dev-team guard] WARNING: HEAD changed during this command; changes were not "
                         "verified or reverted. The orchestrator must review git status and git log.\n")
        sys.exit(2)
    pats = protected_patterns(policy, proj, root)
    now_paths = dirty_paths(root) | protected_ignored(root, pats)
    candidates = set(meta["files"]) | now_paths
    reverted, attributed = [], []
    for rel in sorted(candidates):
        # Only files are compared and restored. Directories (for example nested
        # repositories or the worktrees Claude Code creates under
        # .claude/worktrees/) are never deleted or rewritten by the guard.
        if rel.endswith("/") or ((root / rel).is_dir() and not (root / rel).is_symlink()):
            continue
        before = meta["files"].get(rel)
        if before is not None and before.get("kind") == "dir":
            continue
        current = file_state(root / rel)
        if before is not None:
            keys = ("kind", "sha", "target")
            if {k: before.get(k) for k in keys} == {k: current.get(k) for k in keys}:
                continue
        elif rel not in now_paths:
            continue
        path = root / rel
        reason = write_violation(agent, rules, policy, path, proj)
        if reason is None:
            continue
        other = concurrent_writer(sd, policy, proj, path, key, meta["start"], payload.get("agent_id"))
        if other:
            attributed.append(f"{rel}: not reverted, likely changed by {other}")
            continue
        restore(root, rel, meta, snap)
        reverted.append(f"{rel}: {reason}")
    shutil.rmtree(snap, ignore_errors=True)
    if reverted:
        msg = ["[ai-dev-team guard] REVERTED changes this command made outside your permitted area:"]
        msg += [f"  - {r}" for r in reverted]
        msg += [f"  - {a}" for a in attributed]
        msg.append("Do not retry or work around this; report it to the orchestrator.")
        sys.stderr.write("\n".join(msg) + "\n")
        sys.exit(2)
    if attributed:
        emit_context(event, "ai-dev-team guard: " + "; ".join(attributed))
    allow()


# --------------------------------------------------------------------------- main
def main(argv: list[str]) -> None:
    shared = "--plugin-mode" in argv or "--shared-mode" in argv
    post = "--post" in argv
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("hook input is not a JSON object")
    except Exception as exc:
        block(f"could not parse hook input ({exc}); failing closed")

    agent = agent_name(payload, argv)
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    proj = project_root(payload)

    try:
        policy = json.loads((HERE / "policy.json").read_text(encoding="utf-8"))
        team = policy["agents"]
    except Exception as exc:
        if agent is None and shared:
            allow()  # main session is not governed by the guard
        block(f"could not load policy.json ({exc}); failing closed")

    rules = team.get(agent or "")
    if rules is None:
        if not shared:
            block(f"unknown agent '{agent}' for this guard; refusing by default")
        # Main session or a non-team agent: allowed, but journaled so that
        # concurrent changes are not mistaken for a team agent's violation.
        who = "main" if agent is None else f"other:{agent}"
        try:
            sd = state_dir(proj)
            if not post and tool in WRITE_TOOLS:
                raw = tool_input.get("notebook_path") if tool == "NotebookEdit" else tool_input.get("file_path")
                if raw:
                    journal_write(sd, who, payload.get("agent_id"), resolve_target(raw, payload, proj))
            elif tool == "Bash":
                if post:
                    finish_active(sd, call_key(payload))
                else:
                    record_active(sd, call_key(payload), who, payload.get("agent_id"))
        except Exception:
            pass  # bookkeeping must never block the main session
        allow()

    sd = state_dir(proj)
    prune(sd)
    if post:
        if tool == "Bash":
            post_check(agent, rules, policy, payload, proj, sd)
        allow()

    if tool in WRITE_TOOLS:
        raw = tool_input.get("notebook_path") if tool == "NotebookEdit" else tool_input.get("file_path")
        if not raw:
            block(f"{tool} call without a target path")
        target = resolve_target(raw, payload, proj)
        reason = write_violation(agent, rules, policy, target, proj)
        if reason:
            block(reason)
        journal_write(sd, agent, payload.get("agent_id"), target)
        allow()
    if tool == "Bash":
        command = tool_input.get("command", "")
        reason = bash_pattern_violation(rules, policy, command)
        if reason:
            block(reason)
        cwd = Path(payload.get("cwd") or proj)
        root = git_toplevel(cwd)
        if root is None:
            block("cannot verify file changes outside a git repository; team agents may run Bash only inside one")
        try:
            take_snapshot(root, proj, policy, sd, call_key(payload), agent, payload.get("agent_id"))
        except Exception as exc:
            block(f"could not snapshot the working tree before this command ({exc}); failing closed")
        record_active(sd, call_key(payload), agent, payload.get("agent_id"))
        allow()
    allow()


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except SystemExit:
        raise
    except Exception as exc:  # fail closed for unexpected errors
        sys.stderr.write(f"[ai-dev-team guard] BLOCKED: internal error ({exc}); failing closed\n")
        sys.exit(2)
