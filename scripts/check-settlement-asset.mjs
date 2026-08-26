/**
 * The settlement asset this app names must be the one the chain asserts.
 *
 * `SETTLEMENT_ASSET` in lib/registries.ts is a constant, because ~40 call sites
 * across five pages use it synchronously — including module-scope helpers like
 * `micro / 10 ** decimals` that cannot await. A constant is the right shape
 * there and the wrong shape for truth: it can disagree with the chain, and both
 * halves stay internally consistent while describing different tokens.
 *
 * That is not hypothetical. The id here was changed to circulating TestNet USDC
 * while the deployed ReputationRegistry was still bootstrapped to a token minted
 * for this project, so every amount on the "Real chain data" pages would have
 * carried a ticker that was not the one being counted. Nothing else catches it:
 * it type-checks, it builds, and the numbers are real — only the label lies.
 *
 * `bootstrap` fixes `usdc_asset` once and `accept_feedback` asserts it on every
 * credit, so that global IS the definition. This reads it, reads the ASA for the
 * ticker and decimals, and fails the build on any disagreement.
 *
 *   node scripts/check-settlement-asset.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const registriesSrc = fs.readFileSync(path.join(here, "..", "lib", "registries.ts"), "utf8");

const declaredAsset = Number(
  (registriesSrc.match(/id:\s*num\(process\.env\.NEXT_PUBLIC_SETTLEMENT_ASSET,\s*([\d_]+)\)/) ?? [])[1]?.replace(/_/g, "") ?? NaN
);
const declaredUnit = (registriesSrc.match(/unitName:\s*"([^"]+)"/) ?? [])[1];
const reputationApp = Number(
  (registriesSrc.match(/NEXT_PUBLIC_REPUTATION_APP,\s*([\d_]+)/) ?? [])[1]?.replace(/_/g, "") ?? NaN
);

const ALGOD = process.env.NEXT_PUBLIC_ALGOD_URL ?? "https://testnet-api.algonode.cloud";
const TOKEN = process.env.NEXT_PUBLIC_ALGOD_TOKEN ?? "";
const headers = TOKEN ? { "X-Algo-API-Token": TOKEN } : undefined;

const get = async (url) => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
};

if (!Number.isInteger(declaredAsset) || !Number.isInteger(reputationApp)) {
  console.error("::error::could not read SETTLEMENT_ASSET / REPUTATION_APP out of lib/registries.ts");
  process.exit(1);
}

let app;
try {
  app = await get(`${ALGOD}/v2/applications/${reputationApp}`);
} catch (err) {
  // A network failure is not a drift. Say so plainly rather than failing a build
  // over an unreachable node — a false red here trains people to ignore it.
  console.log(`  SKIP  could not reach ${ALGOD} (${err.message}). Nothing was verified.`);
  process.exit(0);
}

const key = Buffer.from("usdc_asset", "utf8").toString("base64");
const onChain = (app.params?.["global-state"] ?? []).find((g) => g.key === key)?.value?.uint ?? 0;

if (!onChain) {
  console.error(`::error::ReputationRegistry ${reputationApp} has no usdc_asset global — it was never bootstrapped.`);
  process.exit(1);
}

if (onChain !== declaredAsset) {
  const asset = await get(`${ALGOD}/v2/assets/${onChain}`).catch(() => null);
  const realUnit = asset?.params?.["unit-name"] ?? "unknown";
  console.error(`::error::SETTLEMENT_ASSET drift.`);
  console.error(`::error::lib/registries.ts declares asset ${declaredAsset} (${declaredUnit}).`);
  console.error(`::error::ReputationRegistry ${reputationApp} asserts asset ${onChain} (${realUnit}).`);
  console.error(`::error::Every amount on the real-chain pages would be labelled ${declaredUnit} while counting ${realUnit}.`);
  console.error(`::error::bootstrap is one-shot: either point the app at the registry that holds ${declaredAsset}, or set the constant to ${onChain}.`);
  process.exit(1);
}

const asset = await get(`${ALGOD}/v2/assets/${onChain}`).catch(() => null);
const realUnit = asset?.params?.["unit-name"];
if (realUnit && declaredUnit && realUnit !== declaredUnit) {
  console.error(`::error::asset ${onChain} calls itself "${realUnit}"; lib/registries.ts labels it "${declaredUnit}".`);
  process.exit(1);
}

console.log(`  ok  asset ${onChain} (${realUnit ?? declaredUnit}) — the constant matches what ReputationRegistry ${reputationApp} asserts`);
