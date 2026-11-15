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

## Layout

| Path | Owner | What |
|---|---|---|
| `src/app/` | Aditya | expo-router screens. Tabs: Home, Feed, Closet, Shop. Profile opens from the top corner. |
| `src/components/`, `src/constants/theme.ts` | Aditya | UI components and design tokens |
| `src/components/Mirror.tsx` | Kenil | Mirror slot. Takes the Mirror adapter props and renders a labeled placeholder until the real 3D viewer lands. |
| `shared/contract.ts` | all | Types and sample payloads for every row of the shared interface table. Import as `@shared/contract`. |
| `convex/` | Shresth | Convex backend. Not created yet; excluded from the app's tsconfig. |
| `docs/` | all | Copies of the plan files |

## Rules

- No secrets in the repo. Keys stay in Convex or local `.env*.local` files, which are git-ignored.
- Change `shared/contract.ts` in its own small commit and tell the other owners.
- Sample data must be visibly labeled in the UI.
