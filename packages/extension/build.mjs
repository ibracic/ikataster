// Builds dist/chrome and dist/firefox (unpacked) plus zips for distribution.
// Usage: node build.mjs [--out <dir to also copy zips into>]
import { build } from "esbuild";
import { zipSync } from "fflate";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const { manifest } = await import("./src/manifest.ts").catch(async () => {
  // Node without TS support: bundle manifest.ts on the fly
  const r = await build({ entryPoints: [join(root, "src/manifest.ts")], bundle: true, write: false, format: "esm", platform: "node" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
});

// App origins come from the environment (IKATASTER_ORIGINS or the repo-root .env), never from the repo.
const envFile = join(root, "../../.env");
const fromFile = (() => { try { return readFileSync(envFile, "utf8").match(/^IKATASTER_ORIGINS=(.*)$/m)?.[1]; } catch { return undefined; } })();
const rawOrigins = (process.env.IKATASTER_ORIGINS ?? fromFile ?? "").trim().replace(/^["']|["']$/g, "");
const { parseOrigins } = await import("../bridge/src/protocol.ts").catch(async () => {
  const r = await build({ entryPoints: [join(root, "../bridge/src/protocol.ts")], bundle: true, write: false, format: "esm", platform: "node" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
});
const origins = parseOrigins(rawOrigins);
if (!origins.length) { console.error("IKATASTER_ORIGINS is not set (e.g. https://app.example). See .env.example."); process.exit(1); }

const outArg = process.argv.indexOf("--out");
const extraOut = outArg > 0 ? process.argv[outArg + 1] : null;
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });

const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

for (const target of ["chrome", "firefox"]) {
  const out = join(dist, target);
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: { background: join(root, "src/background.ts"), relay: join(root, "src/relay.ts"), popup: join(root, "src/popup.ts") },
    outdir: out, bundle: true, format: "iife", target: ["chrome110", "firefox140"], minify: false, legalComments: "none",
    define: { __IKATASTER_ORIGINS__: JSON.stringify(origins.join(",")) },
  });
  // background declared as module in the manifest: iife output is valid module code too
  cpSync(join(root, "static"), out, { recursive: true });
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest(target, pkg.version, origins), null, 2));
  const files = Object.fromEntries(walk(out).map((p) => [relative(out, p), readFileSync(p)]));
  const zip = join(dist, `ikataster-${target}-${pkg.version}.zip`);
  writeFileSync(zip, zipSync(files, { level: 9 }));
  console.log(`${target}: ${Object.keys(files).length} files -> ${relative(root, zip)}`);
  if (extraOut) {
    mkdirSync(extraOut, { recursive: true });
    cpSync(zip, join(extraOut, `ikataster-${target}.zip`));
  }
}
