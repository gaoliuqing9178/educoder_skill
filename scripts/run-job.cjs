"use strict";
const fs = require("fs");
const path = require("path");
const { runtimeDir } = require("./lib.cjs");

const snippet = process.argv[2];
const timeoutSec = Number(process.argv[3] || 240);
if (!snippet) {
  console.error("usage: node run-job.cjs <snippet.js> [timeoutSeconds]");
  process.exit(2);
}

const JOBS = path.join(runtimeDir(), "jobs");
const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
fs.copyFileSync(snippet, path.join(JOBS, id + ".js"));

const outFile = path.join(JOBS, id + ".out");
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  const deadline = Date.now() + timeoutSec * 1000;
  while (!fs.existsSync(outFile)) {
    if (Date.now() > deadline) {
      console.error("TIMEOUT waiting for job " + id + " (is cdp-daemon.cjs running?)");
      process.exit(1);
    }
    await sleep(400);
  }
  const out = fs.readFileSync(outFile, "utf8");
  process.stdout.write(out);
  process.exit(out.startsWith("OK") ? 0 : 1);
})();