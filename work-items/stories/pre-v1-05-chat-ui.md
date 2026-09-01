# PRE-05: Chat UI Is the Product

Status: done

As the operator, the chat shell on the real origin is how I use the agent: sign in, Connected, live view, takeover, harness and plan actuals. The URL never has `token=`.

## Acceptance criteria

- Sign-in overlay on the same origin as `/auth` and `/chat`.
- Connected pill when the Docker helper is paired; disconnected copy when it quits.
- Live JPEG after a run starts; takeover then resume from a new observation.
- Chat/UI shows harness verification (and recovery) and page-plan progress/actuals, not only model prose.
- No `?token=` required for the consumer path.

## Decisions

See `docs/pre-v1.md` and `docs/decisions.md` D13, D16, D17. Harness remains the source of truth.

## Tasks

- [PRE-05-T01](../tasks/pre-v1-05-t01-chat-ui.md)
- [PRE-05-T02](../tasks/pre-v1-05-t02-harness-plan-cards.md)

## Tests

Playwright against `src/hosts/web/public/` plus chat WS events. See `docs/test-design.md` (PRE-05).
