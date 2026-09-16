import { expect, test } from "@playwright/test";

const BASE_URL = process.env.QC_E2E_BASE_URL ?? "http://localhost:3100";

test("bucket row actions escape the table overflow boundary", async ({ context, page }) => {
  await context.addCookies([{ name: "qc_visual_qa_user", value: "franco@qualifiedcommercial.com", url: BASE_URL }]);

  await page.route(/\/api\/v1\//, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/\/+$/, "");
    let body: unknown = [];

    if (path.endsWith("/auth/me")) {
      body = {
        id: "10000000-0000-0000-0000-000000000001",
        clerk_id: "visual-qa",
        email: "franco@qualifiedcommercial.com",
        name: "Visual QA",
        role: "super_admin",
      };
    } else if (path.endsWith("/buckets")) {
      body = [{
        id: "4f914953-0000-0000-0000-000000000001",
        name: "Valentin Deheljan",
        client_name: "Valentin Deheljan",
        bucket_type: "dealer_ai_intake",
        status: "collecting_documents",
        created_at: "2026-09-12T12:00:00Z",
        updated_at: "2026-09-12T12:00:00Z",
        file_count: 36,
        uploaded_file_count: 36,
        vendor_access_count: 0,
        linked_files: [{
          id: "linked-file-1",
          kind: "Field Desk file",
          label: "UnieLogics",
          reference: "QC-2026-00001",
          route: "/files/linked-file-1",
          surface: "field_desk",
        }],
      }];
    } else if (path.endsWith("/operator-files/link-options")) {
      body = { buckets: [], intakes: [] };
    } else if (path.endsWith("/operator-files")) {
      body = {
        items: [],
        rollup: { total: 0, promoted: 0, working: 0, needs_attention: 0, real_estate: 0, main_street: 0, dealer: 0, mca: 0 },
        limit: 200,
        filters: { vertical: "all", origin: "all", q: null },
      };
    } else if (path.endsWith("/search")) {
      body = [{
        client_id: "10000000-0000-0000-0000-000000000099",
        client_name: "Alpha Client",
        items: [{
          id: "10000000-0000-0000-0000-000000000098",
          kind: "client",
          title: "Alpha Client",
          subtitle: "Keyboard result",
        }],
      }];
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/admin/buckets", { waitUntil: "domcontentloaded" });
  const actionButton = page.getByRole("button", { name: "Actions for Valentin Deheljan" });
  await expect(actionButton).toBeVisible();
  await actionButton.click();

  const menu = page.getByRole("menu", { name: "Actions for Valentin Deheljan" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open bucket" })).toBeVisible();

  const geometry = await page.evaluate(() => {
    const tableWrap = document.querySelector(".bucket-list-table")?.closest(".tblwrap");
    const menu = document.querySelector(".actmenu--portal");
    const tableRect = tableWrap?.getBoundingClientRect();
    const menuRect = menu?.getBoundingClientRect();
    return {
      menuIsBodyChild: menu?.parentElement === document.body,
      menuBottom: menuRect?.bottom ?? 0,
      menuTop: menuRect?.top ?? 0,
      tableBottom: tableRect?.bottom ?? 0,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.menuIsBodyChild).toBe(true);
  expect(geometry.menuTop).toBeGreaterThanOrEqual(12);
  expect(geometry.menuBottom).toBeLessThanOrEqual(geometry.viewportHeight - 12 + 1);
  expect(geometry.menuBottom).toBeGreaterThan(geometry.tableBottom);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(actionButton).toBeFocused();

  const workspace = page.getByRole("region", { name: "Bucket list" });
  await workspace.getByRole("button", { name: "Focus table" }).click();
  const focusedWorkspace = page.getByRole("dialog", { name: "Bucket list" });
  await focusedWorkspace.getByRole("button", { name: "Actions for Valentin Deheljan" }).click();
  const focusedMenu = focusedWorkspace.getByRole("menu", { name: "Actions for Valentin Deheljan" });
  await expect(focusedMenu).toBeVisible();
  await expect(focusedMenu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(focusedMenu.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(focusedMenu).toBeHidden();
  await expect(focusedWorkspace).toHaveAttribute("data-focused", "true");

  // The application-shell command palette is a higher-priority modal. A
  // focused table must yield its focus trap and scroll lock, then receive
  // focus back after the palette closes.
  await page.keyboard.press("Control+k");
  const globalSearch = page.getByRole("dialog", { name: "Global search" });
  await expect(globalSearch).toBeVisible();
  await expect(page.getByRole("region", { name: "Bucket list" })).toHaveAttribute("data-focused", "false");
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await globalSearch.getByRole("textbox", { name: "Search" }).fill("alpha");
  const searchResult = globalSearch.getByRole("button", { name: /Alpha Client/ });
  await expect(searchResult).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(searchResult).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(globalSearch).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(actionButton).toBeFocused();

  await page.getByRole("button", { name: "Focus table" }).click();
  // Chromium reserves Ctrl+J for downloads, so dispatch the app shortcut
  // directly to exercise the same document-level handler in automation.
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "j",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })));
  const tools = page.getByRole("dialog", { name: "All tools" });
  await expect(tools).toBeVisible();
  await expect(page.getByRole("region", { name: "Bucket list" })).toHaveAttribute("data-focused", "false");
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  const toolLinks = tools.getByRole("link");
  await expect(toolLinks.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(toolLinks.last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tools).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page.getByRole("button", { name: "Focus table" })).toBeFocused();
});
