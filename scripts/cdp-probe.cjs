"use strict";
// Diagnose CDP attach problems: which port files exist, is the port listening,
// does the HTTP API answer, and does the browser websocket accept an upgrade.
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { discoverEndpoint, userDataDirs } = require("./lib.cjs");

function tcpOpen(host, port) {
  return new Promise(function (resolve) {
    const s = net.connect({ host: host, port: port });
    const done = function (v) { try { s.destroy(); } catch (e) {} resolve(v); };
    s.setTimeout(2000);
    s.on("connect", function () { done(true); });
    s.on("timeout", function () { done(false); });
    s.on("error", function () { done(false); });
  });
}

function get(host, port, p) {
  return new Promise(function (resolve) {
    const r = http.request({ host: host, port: port, path: p, method: "GET" }, function (res) {
      let body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () { resolve({ status: res.statusCode, body: body.slice(0, 200) }); });
    });
    r.on("error", function (e) { resolve({ error: e.message }); });
    r.end();
  });
}

function wsUpgrade(host, port, p) {
  return new Promise(function (resolve) {
    const r = http.request({
      host: host, port: port, path: p, method: "GET",
      headers: {
        Connection: "Upgrade", Upgrade: "websocket",
        "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      },
    });
    r.on("upgrade", function (res, socket) { socket.destroy(); resolve({ upgrade: res.statusCode }); });
    r.on("response", function (res) { res.resume(); resolve({ status: res.statusCode }); });
    r.on("error", function (e) { resolve({ error: e.message }); });
    r.end();
  });
}

(async function () {
  console.log("candidate user-data dirs:");
  for (const dir of userDataDirs()) {
    const f = path.join(dir, "DevToolsActivePort");
    console.log("  " + (fs.existsSync(f) ? "[port file]" : "[ missing ]") + " " + dir);
  }

  const endpoint = discoverEndpoint();
  console.log("\nresolved endpoint: " + endpoint);
  const m = endpoint.match(/^(?:wss?|https?):\/\/([^:/]+):(\d+)(\/.*)?$/);
  if (!m) { console.log("cannot parse endpoint; set CDP_ENDPOINT explicitly"); return; }

  const host = m[1];
  const port = Number(m[2]);
  const wsPath = m[3] || "/devtools/browser";
  console.log("host=" + host + " port=" + port);
  console.log("tcp port open:     " + (await tcpOpen(host, port)));
  console.log("GET /json/version: " + JSON.stringify(await get(host, port, "/json/version")));
  console.log("ws upgrade:        " + JSON.stringify(await wsUpgrade(host, port, wsPath)));

  console.log("\nReading the result:");
  console.log("- tcp port closed            -> the browser is not in debug mode. A stale DevToolsActivePort");
  console.log("                                file survives the browser closing, so relaunch the browser with");
  console.log("                                --remote-debugging-port=<port> using its normal profile.");
  console.log("- /json/* 404 but ws 101      -> normal on current Edge/Chrome. Attach with the ws:// endpoint;");
  console.log("                                do not pass the http://127.0.0.1:<port> root.");
  console.log("- tcp open but ws upgrade 404 -> wrong wsPath; re-read DevToolsActivePort line 2.");
})();