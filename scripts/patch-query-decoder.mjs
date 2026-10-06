import { readFileSync, writeFileSync } from "node:fs";
// Expo Router 57 uses CommonJS query-string 7. The fixed decoder 0.5 is ESM.
// Keep the upstream security fix and adapt only the import, for Node and Metro.
const path = "node_modules/query-string/index.js";
const version = JSON.parse(
  readFileSync("node_modules/query-string/package.json", "utf8"),
).version;
if (version !== "7.1.3")
  throw new Error(
    "Review the query-string decoder adapter after upgrading Expo Router",
  );
const original = "const decodeComponent = require('decode-uri-component');";
const adapted =
  "const decodeComponent = require('decode-uri-component').default;";
const source = readFileSync(path, "utf8");
if (source.includes(original))
  writeFileSync(path, source.replace(original, adapted));
else if (!source.includes(adapted))
  throw new Error(
    "Unexpected query-string decoder import; security adapter was not applied",
  );
console.log("Expo Router query decoding uses the patched 0.5 decoder.");
