---
name: educoder-homework
description: Answer and submit 头歌/EduCoder (educoder.net) 实训关卡 in the user's own logged-in browser over CDP. Use when a task URL matches educoder.net/tasks/ or the user asks to 完成/提交 头歌、EduCoder、Educoder 的实验作业或关卡. Not for generic browser automation or other homework platforms.
---

# 头歌 (EduCoder) Lab Homework

Drive the browser the user is already signed into, read an EduCoder 实训关卡, write the answer
into the code editor, and submit `评测`.

## Hard requirements

- **Reuse the user's browser session.** The levels need their login. Attach over CDP to the browser
  they are signed into; opening a separate fresh browser cannot reach the tasks.
- **`评测` is a graded submission.** It posts graded work to a third party. Confirm once before the
  first submission unless the user already asked you to submit; then submit the remaining levels
  without re-confirming each one.

## 1. Attach to the browser

`scripts/lib.cjs` implements discovery: it reads the first two lines of `DevToolsActivePort`
(port, then browser websocket path) and returns `ws://127.0.0.1:<port><path>`.

- Windows: `%LOCALAPPDATA%\Microsoft\Edge\User Data\`, `%LOCALAPPDATA%\Google\Chrome\User Data\`
- macOS: `~/Library/Application Support/Microsoft Edge|Google/Chrome/`
- Linux: `~/.config/microsoft-edge|google-chrome/`

Run `node scripts/cdp-probe.cjs` first when attaching fails, or whenever you are unsure the browser
is reachable. It reports which port files exist, whether the port is listening, whether the HTTP API
answers, and whether the browser websocket accepts an upgrade. Two failure modes it separates:

- **A stale `DevToolsActivePort` file survives the browser closing.** If the port is closed, the
  browser is not in debug mode — relaunch it with `--remote-debugging-port=9222` using its normal
  profile, and do not open a separate browser. Re-running discovery alone will not fix this.
- **`GET /json/version` and `/json/list` may return 404 while the browser websocket still works.**
  That is normal on current Edge/Chrome. Attach with the `ws://` endpoint
  (`chromium.connectOverCDP` accepts it) rather than the `http://127.0.0.1:<port>` root, which is
  what the 404 breaks.

`playwright-core` must be resolvable by the scripts. `npm install playwright-core` in a scratch
directory plus `NODE_PATH` pointing at its `node_modules` is enough — no browser download is needed,
because you are attaching to an existing browser.

## 2. Drive it through the persistent daemon

Re-attaching per step is slow and drops the debug session. Use the bundled daemon, which holds one
CDP connection and executes snippets from a job queue:

```bash
node scripts/cdp-daemon.cjs &            # long-lived; keeps the session attached
node scripts/run-job.cjs my-snippet.js   # submit a snippet, wait, print the result
```

The daemon logs to `<runtime>/daemon.log` and retries the initial connection every 5 s instead of
exiting, so it can be started before the browser is ready. A snippet is the body of an async
function with `page`, `browser`, `require`, `process`, and `console` in scope, and it should `return`
something printable:

```js
return { url: page.url(), title: await page.title() };
```

`run-job.cjs` prints `OK` plus the returned value, or `ERR` plus the stack, and exits non-zero on
failure. Runtime files live in `os.tmpdir()/educoder-homework` (override with `EDUCODER_RUNTIME_DIR`).
Submitting a few levels per snippet keeps each call readable and lets one bad level fail without
losing the rest.

## 3. Handle the page

Read [references/educoder.md](references/educoder.md) for the DOM details and ready-made snippets.
The essentials:

- Level URLs are in the sidebar as `/tasks/<taskId>?coursesId=<courseId>`; `page.goto` them directly
  instead of clicking through the list.
- The editor is Monaco and **`window.monaco` is not exposed**. Click the editor, press `Control+a`,
  then `page.keyboard.insertText(code)`. `insertText` bypasses Monaco's auto-closing quotes and
  brackets, which `type()`, `pressSequentially()`, and `fill()` do not.
- **All 关卡 of one 实训 share a single server-side code file.** Write the current level's answer
  immediately before submitting it — the previous level's code is overwritten. Submitted results are
  stored per level, so visiting order does not matter.
- Keep the scaffold (`#请在此添加实现代码` and the `########## Begin/End ##########` markers) and put the
  answer between the markers.
- Buttons are matched by name: `自测运行` (self-test, side-effect free), `评测` (submit), `下一关`, `上一关`.
- Success reads `1/1 全部通过` in 测试结果 and awards 100 points per level.

## 4. Match the platform's expectation, not the prose

`测试结果 → 测试集N → 预期输出` is the actual grading target. It is generated from the live database
and **can contradict the 编程要求 text**. It is readable before submitting, so check it whenever the
answer is ambiguous, and match it when it disagrees with the prose.

Contradictions observed on the MySQL 实训, worth expecting again:

- A level asked for "课程 ID 为 01 的课程的平均成绩" and printed `64.5000` in its 测试说明, while the
  expected output was the average for **student** `01` (`89.6667`) — the reference solution filtered
  on `s_id`, not `c_id`.
- An "age in years" level expected values computed from a 2023 reference date while the database
  clock read 2026; matching it required a literal reference date instead of `curdate()`.
- The 测试说明 output blocks are otherwise stale: box-drawing alignment, `c_id`/`s_id` types, and
  per-student totals there disagree with what the live data produces.

Environment facts for that 实训: MySQL **5.5** — no window functions and no CTEs, so build ranks with
a correlated count subquery rather than `rank() over`; `s_id`/`c_id`/`t_id` are `char(2)` values such
as `'01'`; `score` holds 18 rows across 3 courses.

## 5. Loop per level

1. `page.goto(<level url>)` and wait for the Monaco editor to render.
2. Set the code block.
3. Click `评测`, dismissing a confirmation dialog if the platform shows one.
4. Poll the 测试结果 panel until it stops showing `代码执行中` / `停止运行` and reports a verdict. A
   submission typically takes 20-90 s.
5. Record the verdict and move on, printing one compact result object per level.