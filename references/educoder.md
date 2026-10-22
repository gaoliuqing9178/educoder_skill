# EduCoder page reference

Confirmed against `https://www-cdn.educoder.net/tasks/...` (头歌, MySQL 实训) with Edge over CDP.

## Page anatomy

- Header bar: username, points badge, `<实验名>`, `实验总用时：HH:MM:SS`, `更多操作`.
- Left column: 学习内容 / 记录 / 评论 tabs, then 任务描述, 编程要求, 测试说明 (and a rendered schema image).
- Right column: file tabs `代码文件` and `实验环境1`, the Monaco editor, then the result panel.
- Bottom right: `下一关` / `自测运行` / `评测` (and `上一关` once past level 1).
- The level list is a set of anchors in the DOM: text `N. <关卡名>`, `href="/tasks/<taskId>?coursesId=<courseId>"`.
  The landing page `/tasks/<coursesId>/<categoryId>/<taskId>?coursesId=<courseId>` shows level 1 plus that list.

## Editor

Monaco, and `window.monaco` is `undefined`, so there is no API handle to set the model. `textarea.inputarea`
exists but writing to it directly does not reliably update the model either.

Set code by focusing and replacing, using `insertText` so Monaco does not auto-close quotes/brackets:

```js
const ed = page.locator(".monaco-editor").first();
await ed.click({ position: { x: 400, y: 120 } });
await page.waitForTimeout(250);
await page.keyboard.press("Control+a");
await page.waitForTimeout(150);
await page.keyboard.insertText(code);   // literal insert; type() would double up ' and "
await page.waitForTimeout(600);
```

Read the model back with the rendered lines (the textarea only holds the current line):

```js
const now = await page.locator(".monaco-editor").first().locator(".view-lines").innerText();
```

There are two `.monaco-editor` nodes; the first is the visible one — prefer `.first()` over
eyeballing bounding boxes.

## Result panel

Two tabs: `测试结果` (per-test-set expected vs actual, and the verdict) and `自测运行结果` (the raw
run output). Panel content is only populated after a run; opening the tab before running shows the
expected side empty.

Read the expected output before submitting (useful when the prose is ambiguous) by clicking
`测试结果`, then the test-set row, then reading the panel text:

```js
await page.getByText("测试结果", { exact: true }).first().click({ timeout: 6000 });
await page.getByText("测试集1", { exact: true }).first().click({ timeout: 6000 });
await page.waitForTimeout(2000);
const t = await page.evaluate(() => document.body.innerText);
const a = t.indexOf("测试集1");
const b = t.indexOf("本关最大执行时间");
const panel = t.slice(a, b);   // holds "—— 预期输出 ——" and "—— 实际输出 ——"
```

Layout gotcha: the two columns are side by side, but `innerText` linearizes the column headers
first and the expected table last. Do not conclude from the header order that 预期输出 is empty —
confirm visually with a screenshot when it matters.

## Self-test

```js
await page.getByRole("button", { name: "自测运行" }).click();
await page.waitForTimeout(3000);
let result = "", stable = 0;
for (let k = 0; k < 90; k++) {
  const t = await page.evaluate(() => document.body.innerText);
  const i = t.indexOf("自测运行结果");
  const seg = i >= 0 ? t.slice(i, i + 2000) : t.slice(-2000);
  const j = seg.indexOf("本关最大执行时间");
  result = (j > 0 ? seg.slice(0, j) : seg).replace(/\r/g, "");
  if (/代码执行中|停止运行/.test(seg)) stable = 0; else { stable++; if (stable >= 3) break; }
  await page.waitForTimeout(2000);
}
```

`停止运行` in the button area means the container is still running; `运行结果` alone with a fresh
timestamp means it finished.

## Submit

```js
await page.getByRole("button", { name: "评测" }).click();
await page.waitForTimeout(2000);
for (const nm of ["确定", "确认", "继续"]) {
  try { await page.getByRole("button", { name: nm }).first().click({ timeout: 1500 }); } catch (e) {}
}
let panel = "", stable = 0;
for (let k = 0; k < 80; k++) {
  await page.waitForTimeout(2500);
  const t = await page.evaluate(() => document.body.innerText);
  const i = t.lastIndexOf("测试结果");
  const j = t.indexOf("本关最大执行时间", i);
  panel = t.slice(i, j > 0 ? j : i + 3000).replace(/\r/g, "");
  if (/代码执行中|评测中|停止运行/.test(panel)) { stable = 0; continue; }
  stable++; if (stable >= 3) break;
}
```

Pass looks like `1/1\n全部通过` plus a per-test-set line. Points increase by 100 per level, so the
header badge total is a cheap cross-check that N levels really scored.

## Misc

- `实验环境1` is an interactive MySQL shell. Useful for one-off data inspection, but `自测运行`
  already returns query output, so it is rarely worth driving.
- Multi-statement scripts work, but a probe returning nothing usually means the container is still
  starting; re-run and poll rather than assuming the SQL failed.
- The editor re-indents code when the page reloads; do not treat the reformatted text as a
  different answer.
- Clicking a level link replaces the shared code file, so always set the code for the level you are
  about to submit — even if the editor already looks non-empty.