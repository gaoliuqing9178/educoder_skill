"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

function userDataDirs() {
  const dirs = [];
  const home = os.homedir();
  if (process.env.EDUCODER_USER_DATA_DIR) dirs.push(process.env.EDUCODER_USER_DATA_DIR);
  if (process.env.LOCALAPPDATA) {
    dirs.push(path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "User Data"));
    dirs.push(path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data"));
  }
  dirs.push(path.join(home, "Library", "Application Support", "Microsoft Edge"));
  dirs.push(path.join(home, "Library", "Application Support", "Google", "Chrome"));
  dirs.push(path.join(home, ".config", "microsoft-edge"));
  dirs.push(path.join(home, ".config", "google-chrome"));
  return dirs;
}

// Returns a ws:// browser endpoint, or the conventional http one as a fallback.
function discoverEndpoint() {
  if (process.env.CDP_ENDPOINT) return process.env.CDP_ENDPOINT;
  for (const dir of userDataDirs()) {
    try {
      const lines = fs.readFileSync(path.join(dir, "DevToolsActivePort"), "utf8").split(/\r?\n/).filter(Boolean);
      if (lines.length >= 2) return "ws://127.0.0.1:" + lines[0] + lines[1];
    } catch (e) {}
  }
  return "http://127.0.0.1:9222";
}

function runtimeDir() {
  const dir = process.env.EDUCODER_RUNTIME_DIR || path.join(os.tmpdir(), "educoder-homework");
  fs.mkdirSync(path.join(dir, "jobs"), { recursive: true });
  return dir;
}

module.exports = { discoverEndpoint, runtimeDir, userDataDirs };