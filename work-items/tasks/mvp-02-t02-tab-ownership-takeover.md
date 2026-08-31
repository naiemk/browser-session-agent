# MVP-02-T02: Tab ownership and safe takeover

Status: planned  
Story: MVP-02  
Depends: MVP-02-T01

## Spec

Tabs have stable ids and run ownership. The user can take over the visible tab; the agent must not click/type while the exclusive lock is released.

## Possible

Playwright `page` objects are not durable ids. We assign `tabId` and map it in `state.json`. `page.bringToFront()` focuses the tab. We cannot prevent the user from clicking; we can prevent the agent from racing them.

## Do

- Opened pages get `tabId` + `ownerRunId`
- `claimTab` / `releaseLock` / `resumeLock`
- Actions check ownership and lock
- Takeover: bring to front, `awaiting_takeover`, lock off
- Extra pages the user opens remain unowned

## Tests

- Action on a foreign `tabId` throws `ownership_error`
- After takeover, click is rejected; after resume, click is allowed
- Two pages: inspect uses the owned tab, not the unowned one, unless `tabId` is passed

## Done when

Ownership collisions are rejected with a stable error code, and takeover is a lock change plus focus, not a new browser.
