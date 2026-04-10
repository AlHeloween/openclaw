---
name: cmd-runner
description: Run interactive Windows commands safely via cmd_runner (ConPTY-only) with per-run logs and an inbox bridge.
---

# cmd-runner

Use this skill when a command may be:

- long/noisy,
- interactive (prompts, TUIs),
- crash-prone or likely to destabilize the agent when run directly.

## What cmd_runner is (current)

- Windows-only, ConPTY-only, serverless (no background server, no TCP control plane).
- Root-only policy:
  - Repo checkout: `cmd_runner.exe` at repo root (Delphi binary).
  - Release bundle: run from the bundle root (cwd contains `cmd_runner.exe`).
- Logs are written to: `logs/cmd_runner/<run_id>/`
- Programmatic input bridge: append JSONL messages to `logs/cmd_runner/<run_id>/inbox.jsonl`.

## How to run it (recommended)

- Repo/dev:
  - `.\cmd_runner.exe ...` (Delphi binary at repo root)
- Release bundle:
  - `cmd_runner.exe ...` (preferred; no `uv` required)
- Via adm (integration; keeps a single progress-log cycle):
  - `tools/adm.exe --cmd-runner <cmd_runner args...>`
  - Example: `tools/adm.exe --cmd-runner start -- <command ...>`

## Core workflow

1. Start an interactive run (spawns a new window; interactive session is hosted there):

- `.\cmd_runner.exe start -- <command ...>`
  - Prints `run_id` and `inbox=` path in the _current_ terminal.

2. Check status first (from the current terminal):

- `.\cmd_runner.exe list`
- `.\cmd_runner.exe status <run_id>`
  - Use `status` first to confirm the program is still alive and did not crash before reading output.

3. Tail output (from the current terminal):

- Repo checkout: `.\cmd_runner.exe tail <run_id>` (repo root)
- Release bundle: `cmd_runner.exe tail <run_id>` (bundle root)
  - Start with non-follow `tail` for a compact snapshot.
  - Add `--follow` only when live streaming is needed.
  - Prefer repeated `status`/non-follow `tail` checks over ad hoc shell sleeps; keep delay/wait handling inside the cmd_runner workflow.

4. Inject input programmatically (bridge):

- Append JSONL to: `logs/cmd_runner/<run_id>/inbox.jsonl`
- Built-in (preferred):
  - `.\cmd_runner.exe send <run_id> --keys "TEXT:/exit,ENTER"`
- Built-in bridge command (preferred in all supported modes):
  - `.\cmd_runner.exe send <run_id> --keys "TEXT:/exit,ENTER"`

5. Stop (serverless terminate):

- `.\cmd_runner.exe stop <run_id> --reason "done"`
  - Writes `logs/cmd_runner/<run_id>/stop_request.json`; the hosting cmd_runner watches for it and terminates the Job Object.

Notes:

- `add_crlf` defaults to `false` (no implicit Enter). Use `ENTER` in `keys` or `--crlf` in the helper.
- Supported terminal hosts are `conhost` and `wt`.
- Omit `--terminal` unless you explicitly need to force a host.

<!-- ADID_ROLLBACK (from adm)
  SDID_ROLLBACK {
    "target_file": "D:\\zPython\\ADID_Python\\artefacts/skills/cmd-runner/SKILL.md"
    "update_script": "adm"
    "backup_path": "D:\\zPython\\ADID_Python\\artefacts/skills/cmd-runner/SKILL.md.backup_20260407T050437_063780"
    "created_at": "2026-04-06T21:04:37.071785+00:00"
    "backup_hash": "8c29c2b40ac8c02e0b1c0c35cc336f4e"
    "new_hash": "409efc5d9266a30df9360e79c0c0eba9"
    "goal_id": "replace_canonical_cmd_runner_skill_helper"
    "semantics": "Remove mainline guidance that still points at the old Python helper script."
    "update_attrs": {"relative_path": "artefacts/skills/cmd-runner/SKILL.md", "update_type": "text", "mode": "replace", "encoding": "utf-8", "find_pattern": null, "find_text": "- Helper (legacy but still available):\n  - `uv run scripts/cmd_runner_inbox_send.py \u002d\u002drun-id <run_id> \u002d\u002dkeys \"TEXT:/exit,ENTER\"`", "replace_present": true}
    "restore_cmd": "uv run adm \u002d\u002drollback \"D:\\zPython\\ADID_Python\\artefacts/skills/cmd-runner/SKILL.md\""
  }
-->
