"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { discoverEndpoint, runtimeDir } = require("./lib.cjs");

const JOBS = path.join(runtimeDir(), "jobs");
const LOG = path.join(runtimeDir(), "daemon.log");
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

function log() {
  const line = new Date().toISOString() + "  " + Array.prototype.join.call(arguments, " ") + "\n";
  try { fs.appendFileSync(LOG, line); } catch (e) {}
  process.stdout.write(line);
}

let browser = null;
let page = null;

function pickPage(b) {
  const all = [];
  for (const c of b.contexts()) for (const p of c.pages()) all.push(p);
  return all.find(function (p) { return /educoder\.net/.test(p.url() || ""); }) || all[0] || null;
}

async function connect() {
  const endpoint = discoverEndpoint();
  browser = await chromium.connectOverCDP(endpoint, { timeout: 20000 });
  page = pickPage(browser);
  log("connected -> " + endpoint + "  page: " + (page ? page.url() : "(none)"));
}

async function ensure() {
  if (browser && browser.isConnected() && page && !page.isClosed()) return;
  if (browser && browser.isConnected()) {
    const p = pickPage(browser);
    if (p) { page = p; return; }
  }
  if (browser) { try { await browser.close(); } catch (e) {} }
  browser = null; page = null;
  await connect();
}

async function runJob(file) {
  const id = path.basename(file, ".js");
  let out;
  try {
    await ensure();
    const code = fs.readFileSync(file, "utf8");
    const fn = new Function("page", "browser", "require", "process", "console",
      "return (async () => {" + code + "})();");
    const value = await fn(page, browser, require, process, console);
    out = "OK\n" + (value === undefined ? "(no return value)"
      : (typeof value === "string" ? value : JSON.stringify(value, null, 2)));
  } catch (e) {
    out = "ERR\n" + (e && e.stack ? e.stack : String(e));
  }
  fs.writeFileSync(path.join(JOBS, id + ".out"), out, "utf8");
  try { fs.renameSync(file, path.join(JOBS, id + ".done")); } catch (e) {}
  log("job " + id + " -> " + out.split("\n")[0]);
}

(async function () {
  // Keep retrying: the browser may not be open yet, or a stale DevToolsActivePort
  // file may point at a port nothing is listening on.
  for (;;) {
    try { await ensure(); break; }
    catch (e) {
      log("connect failed: " + String(e && e.message ? e.message : e).split("\n")[0] +
          "  (retrying in 5s; run cdp-probe.cjs to diagnose)");
      await sleep(5000);
    }
  }
  log("=== daemon ready (pid " + process.pid + ") ===");
  for (;;) {
    let files = [];
    try { files = fs.readdirSync(JOBS).filter(function (f) { return f.endsWith(".js"); }); } catch (e) {}
    for (const f of files.sort()) await runJob(path.join(JOBS, f));
    await sleep(400);
  }
})().catch(function (e) { log("FATAL " + (e && e.stack ? e.stack : String(e))); process.exit(1); });