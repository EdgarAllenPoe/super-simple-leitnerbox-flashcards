# Simple Leitner Flashcards

A small, dependency-free flashcard website for GitHub Pages. Cards contain plain text on **Side A** and **Side B**.

## Live site

`https://edgarallenpoe.github.io/super-simple-leitnerbox-flashcards/`

## How it works

New cards begin in an **Inbox**. A study session introduces up to **10 new cards per day**, after all cards that are due have been placed in the queue.

| Result | What happens |
|---|---|
| Got it | The card moves to the next box. A card in Box 5 remains in Box 5. |
| Again | The card returns to Box 1. |

The schedule is fixed:

| Box | Review interval |
|---|---:|
| 1 | 1 day |
| 2 | 2 days |
| 3 | 4 days |
| 4 | 8 days |
| 5 | 16 days |

## Storage

- Every change is automatically stored in the browser with `localStorage`.
- **Save deck to file** downloads a JSON backup containing the cards and all study progress.
- **Load deck from file** replaces the current browser deck with a selected backup.
- No card data is sent to a server.

Browser storage belongs to one browser profile on one device. Use backup files when moving to another device, clearing browser data, or keeping an extra copy.

## Keyboard controls

- **Space** or **Enter**: show Side B
- **1**: Again
- **2**: Got it

## Local development

No installation or build step is required. Open `index.html` directly, or serve the folder with any static web server.

Run the automated checks with Node.js 22 or later:

```bash
npm run verify
```

## Deployment

`main` is the source branch. Every pull request and every change to `main` runs the automated checks in `.github/workflows/pages.yml`.

After a successful `main` run, the workflow publishes only the browser-ready static files to `gh-pages` and requests a GitHub Pages rebuild. The production site is served from the root of the `gh-pages` branch. No server, database, account, build service, or runtime dependency is required.

## License

MIT
