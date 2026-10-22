const levels = await page
  .locator('a[href*="/tasks/"]')
  .evaluateAll((links) =>
    links.map((link) => ({
      text: (link.textContent || "").trim(),
      href: link.href,
    }))
  );

return levels;
