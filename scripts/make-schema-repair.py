#!/usr/bin/env python3
"""Generate supabase/schema_repair.sql — a RE-RUNNABLE version of the two base schemas.

Why: live databases got schema.sql by hand-paste at different points in time, so some have
older bases (e.g. missing ai_messages). The originals use bare CREATEs, so re-pasting them
crashes on the first thing that already exists — and a multi-statement request aborts wholesale.
This script rewrites every statement to be idempotent (IF NOT EXISTS / drop-first / DO-guard),
producing one file that safely brings ANY vintage of the database up to the current base,
after which the (already idempotent) migrations apply cleanly.

Run:  python3 scripts/make-schema-repair.py     (from the repo root; commit the output)
"""
import re
from pathlib import Path

SOURCES = ['supabase/schema.sql', 'supabase/schema_v2_autopilot.sql']
OUT = Path('supabase/schema_repair.sql')


def split_statements(sql: str) -> list[str]:
    """Split on top-level semicolons, respecting $tag$ bodies, '…' strings, and -- comments."""
    stmts, buf, i, n = [], [], 0, len(sql)
    dollar = None  # the active dollar-quote tag, e.g. "$$" or "$fn$"
    while i < n:
        ch = sql[i]
        if dollar is None:
            # -- line comment: swallow to end of line (a ';' inside a comment is NOT a split)
            if ch == '-' and sql.startswith('--', i):
                j = sql.find('\n', i)
                j = n if j == -1 else j
                buf.append(sql[i:j])
                i = j
                continue
            # '…' string literal ('' is an escaped quote): a ';' inside is not a split either
            if ch == "'":
                j = i + 1
                while j < n:
                    if sql[j] == "'":
                        if j + 1 < n and sql[j + 1] == "'":
                            j += 2
                            continue
                        break
                    j += 1
                buf.append(sql[i:j + 1])
                i = j + 1
                continue
            m = re.match(r'\$[A-Za-z_]*\$', sql[i:])
            if m:
                dollar = m.group(0)
                buf.append(dollar)
                i += len(dollar)
                continue
            if ch == ';':
                stmts.append(''.join(buf).strip())
                buf = []
                i += 1
                continue
        else:
            if sql.startswith(dollar, i):
                buf.append(dollar)
                i += len(dollar)
                dollar = None
                continue
        buf.append(ch)
        i += 1
    tail = ''.join(buf).strip()
    if tail:
        stmts.append(tail)

    def is_real(s: str) -> bool:
        # keep only statements with at least one non-comment, non-blank line
        return any(line.strip() and not line.strip().startswith('--') for line in s.splitlines())

    return [s for s in stmts if s and is_real(s)]


def do_guard(stmt: str) -> str:
    """Wrap a statement in a DO block that swallows only already-exists errors."""
    return (
        'do $repair$ begin\n' + stmt + ';\n'
        'exception when duplicate_object or duplicate_table or duplicate_column then null;\n'
        'end $repair$'
    )


def transform(stmt: str) -> str:
    # Split leading comment/blank lines from the code; classify + rewrite the CODE, re-attach after.
    lines = stmt.splitlines()
    body_at = next((i for i, ln in enumerate(lines) if ln.strip() and not ln.strip().startswith('--')), 0)
    lead, code = '\n'.join(lines[:body_at]), '\n'.join(lines[body_at:])
    out = _transform_code(code)
    return f'{lead}\n{out}' if lead else out


def _transform_code(stmt: str) -> str:
    head = re.sub(r'\s+', ' ', stmt).lower()
    # create table → if not exists
    if head.startswith('create table ') and 'if not exists' not in head:
        return re.sub(r'(?i)^create table\s+', 'create table if not exists ', stmt, count=1)
    # create [unique] index → if not exists
    m = re.match(r'(?i)^create(\s+unique)?\s+index\s+', stmt)
    if m and 'if not exists' not in head:
        return re.sub(r'(?i)^create(\s+unique)?\s+index\s+',
                      lambda mm: f'create{mm.group(1) or ""} index if not exists ', stmt, count=1)
    # create policy "name" on <table> → drop-first
    if head.startswith('create policy '):
        pm = re.match(r'(?is)^create policy\s+("(?:[^"]+)"|\w+)\s+on\s+([\w."]+)', stmt)
        if pm:
            return f'drop policy if exists {pm.group(1)} on {pm.group(2)};\n{stmt}'
    # create trigger <name> ... on <table> → drop-first
    if head.startswith('create trigger '):
        tm = re.match(r'(?is)^create trigger\s+(\w+)\s.*?\son\s+([\w."]+)', stmt)
        if tm:
            return f'drop trigger if exists {tm.group(1)} on {tm.group(2)};\n{stmt}'
    # create type / alter publication add table → only-once statements: DO-guard them
    if head.startswith('create type ') or head.startswith('alter publication '):
        return do_guard(stmt)
    # top-level seed inserts → on conflict do nothing
    if head.startswith('insert into ') and 'on conflict' not in head:
        return stmt + '\non conflict do nothing'
    # everything else (create or replace fn, alter table enable rls / add column if not exists,
    # grants, do-blocks) is already re-runnable
    return stmt


def main() -> None:
    parts = [
        '-- supabase/schema_repair.sql — GENERATED by scripts/make-schema-repair.py. DO NOT EDIT.\n'
        '-- The two base schemas rewritten to be fully idempotent, so ANY vintage of the database\n'
        '-- can be brought up to the current base by re-running this file (then the migrations).\n'
    ]
    for src in SOURCES:
        sql = Path(src).read_text()
        parts.append(f'\n-- ======== {src} (idempotent rewrite) ========\n')
        for stmt in split_statements(sql):
            parts.append(transform(stmt) + ';\n')
    OUT.write_text('\n'.join(parts))
    text = OUT.read_text()
    # Honest self-check: no unguarded creators may survive. A create policy/trigger counts as
    # guarded when the immediately preceding statement is its drop-if-exists.
    def code_of(s: str) -> str:
        keep = [ln for ln in s.splitlines() if ln.strip() and not ln.strip().startswith('--')]
        return re.sub(r'\s+', ' ', ' '.join(keep)).lower()

    bad = []
    stmts = split_statements(text)
    for i, s in enumerate(stmts):
        h = code_of(s)
        prev = code_of(stmts[i - 1]) if i else ''
        if h.startswith('create table ') and 'if not exists' not in h:
            bad.append(s[:80])
        if h.startswith('create policy ') and not prev.startswith('drop policy if exists'):
            bad.append(s[:80])
        if h.startswith('create trigger ') and not prev.startswith('drop trigger if exists'):
            bad.append(s[:80])
    if bad:
        raise SystemExit('UNGUARDED statements remain: ' + repr(bad))
    print(f'wrote {OUT} ({len(text)} bytes) — all statements guarded')


if __name__ == '__main__':
    main()
