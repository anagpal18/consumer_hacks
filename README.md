# Wear Again V2

Record a video of your clothes, confirm what the app found, and get dressed using what you own. Hackathon build; the plan lives in [docs/build.md](docs/build.md).

## Run

Requires Node 20 or newer.

```bash
npm install
npx expo start          # scan the QR code with Expo Go, or press w for web
npm run web             # web only
npm run typecheck
npm run lint
npx expo export --platform web   # bundle check
```

Add packages with `npx expo install <package>` so versions match the Expo SDK.

## Closet code

The closet code is the only credential for a closet, so it never goes in source. When the app is wired to Convex, put it in `.env.local` (git-ignored):

```bash
EXPO_PUBLIC_CLOSET_CODE=<long random code from docs/backend-handoff.md>
```

The sample-data build needs no code; its mock adapter uses a fake value.

## Layout

| Path | Owner | What |
|---|---|---|
| `src/app/` | Aditya | expo-router screens. Tabs: Home, Feed, Closet, Shop. Profile opens from the top corner. |
| `src/components/`, `src/constants/theme.ts` | Aditya | UI components and design tokens |
| `src/components/Mirror.tsx` | Kenil | Mirror slot. Takes the Mirror adapter props and renders a labeled placeholder until the real 3D viewer lands. |
| `shared/contract.ts` | all | Types and sample payloads for every row of the shared interface table. Import as `@shared/contract`. |
| `src/data/` | Aditya, then Kenil | One data-access seam (`api.ts`). Mock today; see docs/ui-handoff.md. |
| `convex/` | Shresth | Convex backend. Not created yet; excluded from the app's tsconfig. |
| `docs/` | all | Copies of the plan files |

## Rules

- No secrets in the repo. Keys stay in Convex or local `.env*.local` files, which are git-ignored.
- Change `shared/contract.ts` in its own small commit and tell the other owners.
- Sample data must be visibly labeled in the UI.
