/**
 * The explorer must know every method the deployed programs dispatch.
 *
 * A decoder that silently does not recognise a method is worse than one that is
 * absent: the page renders, looks authoritative, and reports "matches no method
 * this explorer knows about" for a call the contract handles perfectly well.
 * That is what happened — the method table drifted behind the contracts and lost
 * the entire bidding subsystem, so every accept_bid on the chain rendered as an
 * unknown selector.
 *
 * This checks BOTH directions against the deployed approval programs:
 *
 *   missing  — the program dispatches a selector the explorer cannot name
 *   phantom  — the explorer claims a method the program never dispatches
 *
 * The deployed program is the authority, not the local artifact. Artifacts can
 * be rebuilt without redeploying, and then this would pass while the chain
 * disagreed.
 */
import algosdk from "algosdk";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGOD = process.env.NEXT_PUBLIC_ALGOD_URL ?? "https://testnet-api.algonode.cloud";
const algod = new algosdk.Algodv2(process.env.NEXT_PUBLIC_ALGOD_TOKEN ?? "", ALGOD, "");

const fail = (m) => { console.log(`::error::${m}`); process.exitCode = 1; };
const selector = (sig) =>
  crypto.createHash("sha512-256").update(sig).digest("hex").slice(0, 8);

/** Pull the signatures the explorer claims, straight out of its own source. */
function declared() {
  const src = fs.readFileSync(path.join(import.meta.dirname, "..", "lib", "tx-decode.ts"), "utf8");
  const out = { IDENTITY: [], REPUTATION: [], VALIDATION: [] };
  for (const key of Object.keys(out)) {
    const block = src.split(`const ${key}_METHODS`)[1]?.split("];")[0] ?? "";
    out[key] = [...block.matchAll(/signature:\s*"([^"]+)"/g)].map((m) => m[1]);
  }
  return out;
}

/** Which app id the explorer is actually pointed at. */
function appIds() {
  const src = fs.readFileSync(path.join(import.meta.dirname, "..", "lib", "registries.ts"), "utf8");
  const grab = (name, env) => {
    const fromEnv = process.env[env];
    if (fromEnv) return Number(fromEnv);
    const m = src.match(new RegExp(`${name}:\\s*\\{[^}]*?appId:\\s*num\\([^,]+,\\s*([0-9_]+)\\)`, "s"));
    return m ? Number(m[1].replace(/_/g, "")) : null;
  };
  return {
    IDENTITY: grab("identity", "NEXT_PUBLIC_IDENTITY_APP"),
    REPUTATION: grab("reputation", "NEXT_PUBLIC_REPUTATION_APP"),
    VALIDATION: grab("validation", "NEXT_PUBLIC_VALIDATION_APP"),
  };
}

/**
 * Every 4-byte selector the program DISPATCHES.
 *
 * Puya emits the whole ARC-4 dispatch table as a single `pushbytess` — the
 * plural multi-push opcode — so the table is one line carrying every selector
 * the router compares the incoming method against. That line is the authority.
 *
 * Two things are deliberately NOT counted, and both were wrong in the first
 * version of this script:
 *
 *   `pushbytes` (singular) is an OUTBOUND selector — this program calling some
 *   other app by inner transaction. ValidationRegistry pushes record_validation
 *   that way to write a verdict into ReputationRegistry. Counting it made the
 *   guard demand that ValidationRegistry's decoder name a method that lives on
 *   a different contract entirely.
 *
 *   `bytecblock` holds every byte constant in the program — box prefixes like
 *   0x6a625f ("jb_"), global-state keys, and the ARC-4 return-log prefix
 *   0x151f7c75. Four of those happen to be four bytes long, and treating them
 *   as selectors would demand method names for things that are not methods.
 */
async function dispatched(appId) {
  const app = await algod.getApplicationByID(appId).do();
  const approval = app.params.approvalProgram;
  const b64 = typeof approval === "string" ? approval : Buffer.from(approval).toString("base64");
  const { result } = await algod.disassemble(Buffer.from(b64, "base64")).do();

  const found = new Set();
  for (const line of result.split("\n")) {
    if (!/^\s*pushbytess\s/.test(line)) continue;
    for (const m of line.matchAll(/0x([0-9a-f]{8})\b/gi)) found.add(m[1].toLowerCase());
  }
  if (!found.size) throw new Error("no pushbytess dispatch table found — the compiler layout changed, and a silent empty set here would pass every check");
  return found;
}

const decl = declared();
const ids = appIds();
let checked = 0;

for (const key of ["IDENTITY", "REPUTATION", "VALIDATION"]) {
  const appId = ids[key];
  const sigs = decl[key];
  if (!appId) { fail(`could not find the ${key} app id`); continue; }
  if (!sigs.length) { fail(`no signatures parsed for ${key}`); continue; }

  let onChain;
  try {
    onChain = await dispatched(appId);
  } catch (err) {
    // A node that will not answer is not the same as a mismatch, and must not
    // be reported as one.
    console.log(`::warning::app ${appId} (${key}) could not be read from ${ALGOD}: ${err.message}`);
    continue;
  }

  const missing = [...onChain].filter((sel) => !sigs.some((s) => selector(s) === sel));
  const phantom = sigs.filter((s) => !onChain.has(selector(s)));

  for (const sel of missing) fail(`${key} app ${appId} dispatches 0x${sel}, which lib/tx-decode.ts cannot name — a real call with that selector renders as "unknown".`);
  for (const s of phantom) fail(`${key} app ${appId} does NOT dispatch "${s}" (0x${selector(s)}), but lib/tx-decode.ts claims it.`);

  if (!missing.length && !phantom.length) console.log(`  ok  ${key} app ${appId} — ${sigs.length} methods, exactly what it dispatches`);
  checked++;
}

if (!checked) fail("no app could be checked — refusing to pass on zero coverage");
