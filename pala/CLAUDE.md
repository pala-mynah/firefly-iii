# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Personal finance pipeline: import bank exports from George (Erste Bank Austria) into a self-hosted Firefly III instance, with automatic categorization rules.

## Stack

- **Firefly III** — self-hosted finance manager (http://localhost:7076)
- **Firefly Data Importer** — not used, we import directly via API (http://localhost:7077)
- **MariaDB** — backend for Firefly
- **Ollama** — local LLM runtime for transaction categorization fallback (http://localhost:11434), model: `qwen2.5:0.5b`
- Python 3.12, virtualenv at `.venv/`

## Running the stack

```bash
make up        # start all containers
make down      # stop
make logs      # follow logs
make status    # check health
make reset     # DESTRUCTIVE: wipe volumes
```

## Accounts in Firefly

| ID | Name | IBAN | Type |
|----|------|------|------|
| 1 | George (Erste Bank) | AT802011184223518400 | asset / current |
| 2 | Erste Sparziel (Round-ups) | AT532011184223518401 | asset / savings |

Opening balances set to 2026-01-01: AT80 = €276.84, AT53 = €16.00.

## Import pipeline

George exports are UTF-16, semicolon-separated CSVs with single-quoted values and German decimal format.

**Step 1** — convert to UTF-8:
```bash
source .venv/bin/activate
python3 convert_csv.py AT80....csv AT53....csv
```

**Step 2** — import into Firefly:
```bash
FIREFLY_ACCESS_TOKEN=$(grep FIREFLY_ACCESS_TOKEN .env | cut -d= -f2-) python3 importer.py
```

`importer.py` constants to update when date range changes:
- `GEORGE_OPENING_BALANCE` / `SAVINGS_OPENING_BALANCE` / `OPENING_BALANCE_DATE`

Round-up entries ("Worauf sparen Sie?") are automatically imported as internal transfers from AT80 → AT53. The AT53 side is skipped on import (already handled).

## Categories and rules

```bash
make categories   # create/update categories + rules + apply retroactively
```

`setup_categories.py` is idempotent — safe to re-run. It:
1. Creates 18 spending categories if they don't exist
2. Creates rule groups + `description_contains` rules for each known merchant
3. Applies categories directly to all uncategorized existing transactions using a two-pass approach

### How categorization works

George card transactions don't carry a counterparty IBAN, so matching is done against the transaction description. The description format for card payments is structured:

```
POS 22,50 BE K1 01.02. 15:17 SUMUP *ANSOML SRL SCHAERBEEK 103
```

**Pass 1 — keyword matching (fast, no network)**
The `POS`/`E-COMM` prefix (amount, country, date, time) is stripped and whitespace is collapsed before comparing against the keywords in `CATEGORIES`. This makes matching reliable regardless of whitespace or encoding variants — `SUMUP *ANSOML` and `SUMUP  *ANSOML` both normalize to the same string.

Manual edits made in the Firefly UI are respected: transactions that already have a category are never overwritten.

**Pass 2 — LLM fallback (Ollama, CPU-only)**
Any withdrawal that still has no category after the keyword pass is sent to a local `qwen2.5:0.5b` model running in the Ollama container at `http://localhost:11434`. The model receives the list of 18 categories and the normalized description, and must reply with exactly one category name. If Ollama is not running or the model returns an unrecognized value, the transaction is left uncategorized — no crash, no wrong category applied.

```bash
make pull-model   # download qwen2.5:0.5b into the Ollama container (~400MB)
```

### Adding new merchants

Add an entry to the `CATEGORIES` dict in `setup_categories.py`, then re-run `make categories`. The LLM will handle truly unknown merchants automatically on the next import.

## API token

Stored in `.env` as `FIREFLY_ACCESS_TOKEN`. To regenerate:
http://localhost:7076/profile → OAuth → Personal Access Tokens
