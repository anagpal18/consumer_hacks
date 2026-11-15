/**
 * One switch for the whole data layer: EXPO_PUBLIC_DATA_MODE=live talks to Convex,
 * anything else uses in-memory sample data. Screens must show FIXTURE_LABEL while
 * IS_FIXTURE_MODE is true so sample data never passes for a real closet.
 */
export type DataMode = 'fixture' | 'live';

export const DATA_MODE: DataMode = process.env.EXPO_PUBLIC_DATA_MODE === 'live' ? 'live' : 'fixture';

export const IS_FIXTURE_MODE = DATA_MODE === 'fixture';

export const FIXTURE_LABEL = 'Sample data';

export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
