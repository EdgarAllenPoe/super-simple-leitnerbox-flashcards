# Simple Leitner Flashcards

A small, dependency-free flashcard website for GitHub Pages. Cards contain plain text on **Side A** and **Side B**.

## Live site

`https://edgarallenpoe.github.io/super-simple-leitnerbox-flashcards/`

## How it works

New cards begin in an **Inbox** and never enter Study automatically. The Inbox tile is a button: click it to move the **5 oldest Inbox cards** into **Box 1**, where they are due immediately and ready to study.

The learner may study **Side A first** or **Side B first**. That choice is remembered in the current browser.

After revealing the other side, the learner chooses one of four conversational responses. The buttons immediately advance to the next card and are also bound to the number keys.

| Key | Response | What happens |
|---:|---|---|
| 1 | I forgot | The card returns to Box 1. |
| 2 | I had to think | The card stays in its current box. |
| 3 | I knew it | The card advances one box. |
| 4 | Too easy | The card advances two boxes. |

Cards never move beyond Box 5. Every response schedules the next review using the interval of the destination box.

| Box | Review interval |
|---|---:|
| 1 | 1 day |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 15 days |
| 5 | 30 days |

## Storage

- Every deck change is automatically stored in the browser with `localStorage`.
- **Save deck to file** downloads a JSON backup containing the cards and all study progress.
- **Load deck from file** replaces the current browser deck with a selected backup.
- **Reset all cards to Inbox** keeps the cards but erases all study progress and returns every card to the Inbox.
- No card data is sent to a server.

Browser storage belongs to one browser profile on one device. Use backup files when moving to another device, clearing browser data, or keeping an extra copy.

## Keyboard controls

- **Space** or **Enter**: reveal the other side
- **1**: I forgot
- **2**: I had to think
- **3**: I knew it
- **4**: Too easy

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
