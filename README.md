# Threaded Sheet Chat (Next.js + Bun)

A demo / assignment app: ChatGPT-style UI with threaded conversations, SQLite persistence (via Bun), and spreadsheet tools over a bundled XLSX.

## Features

- Threaded conversations stored in SQLite (create/switch threads; history loads per thread).
- Streaming chat via Vercel AI SDK UI (`useChat`) + server streaming route (`POST /api/chat`).
- Spreadsheet tools for the bundled workbook at `data/example.xlsx` (Sheet1 only):
  - Read ranges and render previews + modal selection → mention insertion (`@Sheet1!A1:C5`).
  - Update individual cells (writes back to `data/example.xlsx`) — gated behind explicit UI confirmation.
  - Explain formulas (reads formula text from a cell).
  - Mock “send invites” tool.
- Dangerous actions (cell edits, thread deletion) require confirmation tokens.

## Generative UI

### Range preview

![Spreadsheet range preview](public/screenshots/range-preview.png)

### Confirmation card

![Confirmation card](public/screenshots/confirmation-card.png)

## Requirements

- Bun `>= 1.3`.
- Optional: an OpenAI API key if you want real model responses.

## Quickstart

### 1) Install dependencies

```bash
bun install
```

### 2) Configure environment

Copy `.env.example` → `.env.local` and choose one of the modes below.

#### Option A: Run with no API key (mock chat)

Set:

```bash
MOCK_CHAT=1
DB_PATH=data/app.sqlite
```

No OpenAI calls are made; the UI, tool rendering, thread persistence, and confirmation flows still work.

#### Option B: Run with a real model

Set at minimum:

```bash
OPENAI_API_KEY=...
```

Make sure `MOCK_CHAT` is not set to `1` (unset it or set it to `0`) so the server uses the real model.

##### OpenAI direct

```bash
OPENAI_API_KEY=sk-...
# Optional: override model (defaults to gpt-4o-mini)
# OPENAI_MODEL=gpt-4o
```

##### OpenRouter (or other OpenAI-compatible providers)

```bash
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-sonnet-4
# Required for OpenRouter and most compatible providers
OPENAI_API_MODE=chat
# Optional: OpenRouter attribution headers
OPENAI_REFERER=https://your-site.com
OPENAI_TITLE=Your App Name
```

##### Environment variable reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | API key for OpenAI or compatible provider |
| `OPENAI_BASE_URL` | No | Override base URL (e.g. `https://openrouter.ai/api/v1`) |
| `OPENAI_MODEL` | No | Model id (defaults to `gpt-4o-mini`) |
| `OPENAI_API_MODE` | No | `chat` for `/chat/completions`, `responses` for OpenAI Responses API. Defaults to `responses` for OpenAI, auto-selects `chat` when `OPENAI_BASE_URL` is set. |
| `OPENAI_REFERER` | No | `HTTP-Referer` header (OpenRouter attribution) |
| `OPENAI_TITLE` | No | `X-Title` header (OpenRouter attribution) |
| `DB_PATH` | No | SQLite file location (defaults to `data/app.sqlite`) |

### 3) Start the dev server

```bash
bun run dev
```

Open `http://localhost:3000`.

## Data & initialization

### SQLite

- Default DB file: `data/app.sqlite` (override via `DB_PATH`).
- Schema is created automatically on first use (`CREATE TABLE IF NOT EXISTS ...`).
- Local sqlite files are ignored by git (`data/*.sqlite*`).

### Workbook (`data/example.xlsx`)

- Bundled workbook: `data/example.xlsx` (single sheet: `Sheet1`).
- If you need to regenerate it:

```bash
bun run scripts/generate-example-xlsx.ts
```

## Using the app

- Create/select threads from the sidebar.
- Mention ranges in chat like `@Sheet1!A1:C5` to reference spreadsheet data.
- When the assistant reads a range, you’ll see a preview card; click it to open a modal grid.
  - Drag to select a sub-range and click “Insert mention” to add it to your draft.
- When the assistant proposes a cell update or thread deletion, approve/decline in the confirmation card.

## What's Implemented

### Fully implemented

- **Threaded chat UI**: Sidebar with thread list, create/switch/delete threads, auto-generated titles from first user message.
- **Message persistence**: SQLite storage via `bun:sqlite` with full `UIMessage` JSON for tool parts.
- **Streaming responses**: Real-time streaming via Vercel AI SDK with `useChat` and `streamText`.
- **Spreadsheet tools**:
  - `readRange`: Read cell ranges with table preview and modal grid.
  - `updateCell`: Write to cells (gated by confirmation).
  - `explainFormula`: Explain formulas in cells.
  - `sendInvites`: Mock tool to "send invites" from email ranges (gated by confirmation).
- **Confirmation gating**: All dangerous actions (cell updates, thread deletion, invites) require explicit user approval via `confirmAction` client tool with token validation.
- **Range mentions**: Select cells in modal → insert `@Sheet1!A1:B5` mentions into chat input.
- **Generative UI**: Tool results render as interactive cards (table previews, confirmation dialogs, JSON viewers).
- **E2E tests**: Playwright tests covering thread CRUD, chat flow, message persistence (6 tests).

### Partial / simplified

- **Thread titles**: Uses first ~25 chars of first user message (no LLM-generated summaries).
- **Single sheet support**: Only `Sheet1` is recognized; multi-sheet workbooks are not supported.
- **Mock send invites**: Logs to console instead of actually sending emails.

### Limitations

- SheetJS does not recalculate formulas server-side (cached values only).
- XLSX writes assume writable local filesystem (not serverless-safe).
- No user authentication or multi-user support.
- No message editing or regeneration.

### Playwright e2e (real model)

Start the dev server manually with real-model mode enabled:

```bash
PLAYWRIGHT=1 REAL_MODEL=1 DB_PATH=test-results/playwright.sqlite bun run dev
```

Then run Playwright in another terminal:

```bash
bunx playwright test --config=playwright.real.config.ts --reporter=list
# or
bunx playwright test --config=playwright.real.config.ts --reporter=list -g "7.1"
```

Requires a real model configured in `.env.local` (e.g. `OPENAI_API_KEY`) and `MOCK_CHAT` must be unset or `0`.

## Limitations / notes

- SheetJS (`xlsx`) does not recalculate formulas server-side. Formula cells may show cached/stale values until the file is opened in Excel.
- Writing to `data/example.xlsx` assumes a writable filesystem. This is fine for a local assignment, but not serverless-safe without external storage.
- XLSX is trusted-local only (no uploads, no user-controlled paths). Only `Sheet1` is supported and ranges are capped.

## Security

See `SECURITY.md` for details and rationale around using `xlsx` in a trusted-local-only way.
