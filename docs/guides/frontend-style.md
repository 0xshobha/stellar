# Frontend style guide

Direction for anyone changing the **Next.js** UI (`frontend/`).

## Principles

- **Light mode first** — readable panels, no decorative noise.
- **Scannable density** — logs, traces, and competition tables are first-class; typography supports scanning, not marketing blurbs.
- **Motion is informative** — topology and hire events use subtle motion; avoid gratuitous animation.

## Layout and components

- **Panels** — bordered cards (`panel` class) for major sections.
- **Dashboard grid** — chat + catalog + full-width competition + topology + transactions; keep **Agent competition** visible for judge demos.

## Interaction

- **Hover** — slight lift / border emphasis on list rows and cards.
- **Focus** — visible rings for keyboard users.

## Docs site

- Markdown lives under **`docs/`** with nested paths; the app renders via **`/docs/[...slug]`**.
- Prefer **short headings**, **lists**, and **code blocks** — matches in-app `markdown` class styles.

## Related docs

- **[System overview](/docs/architecture/system-overview)** — where the frontend sits in the stack.
