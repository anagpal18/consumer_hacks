/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as closet from "../closet.js";
import type * as demo from "../demo.js";
import type * as detect from "../detect.js";
import type * as lib from "../lib.js";
import type * as media from "../media.js";
import type * as outfits from "../outfits.js";
import type * as privacy from "../privacy.js";
import type * as profiles from "../profiles.js";
import type * as scans from "../scans.js";
import type * as stylist from "../stylist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  closet: typeof closet;
  demo: typeof demo;
  detect: typeof detect;
  lib: typeof lib;
  media: typeof media;
  outfits: typeof outfits;
  privacy: typeof privacy;
  profiles: typeof profiles;
  scans: typeof scans;
  stylist: typeof stylist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
