import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.QC_E2E_BASE_URL ?? "http://localhost:3127";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jpXsAAAAASUVORK5CYII=";
const image = { id: "saved-image", filename: "screenshot.png", mime_type: "image/png", size_bytes: 68, url: `data:image/png;base64,${PNG}` };
const smsThread = { id: "sms:client:sample", title: "Test client", participant_name: "Test client", participant_email: "client@example.test", participant_phone: "+15555550123", participant_type: "client", source_kind: "sms", source_id: "sample", source_ref: null, source_label: "SMS", channel: "sms", transport: "sms", unread_count: 0, message_count: 0, latest_snippet: null, latest_at: "2026-11-09T12:00:00Z", assigned_desk: null, href: "/messages", can_reply: true };

async function harness(page: Page, mode: "normal" | "retry" | "partial" | "warning" = "normal") {
  const state = { uploads: 0, completes: 0, puts: 0, sends: [] as Array<{ channels?: string[]; image_ids?: string[]; body: string }>, messages: [] as unknown[] };
  await page.context().addCookies([{ name: "qc_visual_qa_user", value: "admin@example.test", url: BASE }]);
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    (window as unknown as { revokedMessageImages: number }).revokedMessageImages = 0;
    URL.revokeObjectURL = (url) => { (window as unknown as { revokedMessageImages: number }).revokedMessageImages += 1; revoke(url); };
  });
  await page.route("https://upload.example/**", async (route) => { state.puts += 1; await route.fulfill({ status: 200, body: "" }); });
  await page.route(/\/api\/v1\//, async (route) => {
    const request = route.request();
    const path = decodeURIComponent(new URL(request.url()).pathname.replace("/api/v1", ""));
    let body: unknown = [];
    let status = 200;
    if (path === "/auth/me") body = { id: "qa-user", clerk_id: "qa", email: "admin@example.test", name: "Test operator", role: "super_admin" };
    else if (path === "/communications/contacts") body = { items: [], total: 0, unread_total: 0 };
    else if (path === "/communications/recipients") body = [{ kind: "client", id: "sample", name: "Test client", label: null, email: "client@example.test", phone: "+15555550123" }];
    else if (path === "/communications/capabilities") body = { image_upload: { max_images: 10, max_image_bytes: 10485760, max_total_bytes: 6291456, allowed_mime_types: ["image/png", "image/jpeg", "image/heic"] }, sms: { image_delivery: "secure_link", label: "Images are sent as private, expiring image links in the text message." } };
    else if (path === "/inline-images/upload-init") { state.uploads += 1; body = { image_id: "saved-image", upload_url: "https://upload.example/image", mime_type: "image/png" }; }
    else if (path === "/inline-images/saved-image/complete") { state.completes += 1; body = image; }
    else if (path === "/communications/threads/sms:client:sample") body = { thread: smsThread, messages: state.messages };
    else if (path.endsWith("/messages") && request.method() === "POST") {
      state.sends.push(request.postDataJSON());
      if (mode === "retry" && state.sends.length === 1) { status = 503; body = { detail: "Temporary message delivery failure" }; }
      else {
        state.messages = [{ id: "sent", thread_id: smsThread.id, body: request.postDataJSON().body, sender_name: "Test operator", sender_type: "operator", direction: "outbound", channel: "sms", transport: "sms", created_at: "2026-11-09T12:00:00Z", seen: true, delivery_status: "sent", images: [image] }];
        body = { thread: smsThread, messages: state.messages };
      }
    } else if (path === "/communications/compose") {
      state.sends.push(request.postDataJSON());
      body = mode === "partial" && state.sends.length === 1 ? { ok: false, thread_id: null, results: [{ channel: "sms", ok: true, detail: "SMS accepted" }, { channel: "email", ok: false, detail: "Mailbox unavailable" }] } : { ok: true, thread_id: smsThread.id, results: request.postDataJSON().channels.map((channel: string) => ({ channel, ok: true, detail: mode === "warning" && channel === "sms" ? "sent_not_recorded" : "Accepted" })) };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return state;
}

async function pasteScreenshot(page: Page) {
  await page.getByRole("textbox", { name: "Write a message...", exact: true }).evaluate(async (element) => {
    const canvas = document.createElement("canvas"); canvas.width = 300; canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f4f6fa"; context.fillRect(0, 0, 300, 180);
    context.fillStyle = "#23345c"; context.font = "bold 24px sans-serif"; context.fillText("Loan details", 20, 40);
    context.font = "19px sans-serif"; context.fillText("Balance $12,500", 20, 90); context.fillText("Monthly payment $405", 20, 125);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([blob], "screenshot.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
}

test.setTimeout(90_000);

test("pasted images preview locally, explain SMS delivery, and can be removed before sending", async ({ page }, testInfo) => {
  const state = await harness(page);
  await page.goto(`${BASE}/messages?thread=${encodeURIComponent(smsThread.id)}`);
  await pasteScreenshot(page);
  await expect(page.getByRole("button", { name: "Remove screenshot.png" })).toBeVisible();
  await expect(page.getByText("Images are sent as private, expiring image links in the text message.")).toBeVisible();
  const sendBounds = await page.getByRole("button", { name: "Send message", exact: true }).boundingBox();
  const mobileNav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  if (await mobileNav.isVisible()) {
    const navBounds = await mobileNav.boundingBox();
    expect(sendBounds!.y + sendBounds!.height).toBeLessThanOrEqual(navBounds!.y);
  }
  expect(state.uploads).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("sms-image-draft.png"), fullPage: true });
  await page.getByRole("button", { name: "Remove screenshot.png" }).click();
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { revokedMessageImages: number }).revokedMessageImages)).toBeGreaterThan(0);
});

test("an image-only reply retains its uploaded ID through a delivery failure", async ({ page }) => {
  const state = await harness(page, "retry");
  await page.goto(`${BASE}/messages?thread=${encodeURIComponent(smsThread.id)}`);
  await pasteScreenshot(page);
  const send = page.getByRole("button", { name: "Send message", exact: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("button", { name: "Remove screenshot.png" })).toBeVisible();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("button", { name: "Remove screenshot.png" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "screenshot.png" })).toBeVisible();
  expect(state.sends).toHaveLength(2);
  expect(state.sends.map((sent) => sent.image_ids)).toEqual([["saved-image"], ["saved-image"]]);
  expect(state.sends[0].body).toBe("");
  expect([state.uploads, state.completes, state.puts]).toEqual([1, 1, 1]);
});

test("a partial multi-channel send retries only the failed channel", async ({ page }) => {
  const state = await harness(page, "partial");
  await page.goto(`${BASE}/messages`);
  await page.getByRole("button", { name: "New message", exact: true }).click();
  await page.getByRole("button", { name: /Test client/ }).click();
  await page.locator('.message-image-picker input[type="file"]').setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64") });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Mailbox unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Retry remaining channels" }).click();
  await expect(page.getByRole("button", { name: "Retry remaining channels" })).toHaveCount(0);
  expect(state.sends.map((sent) => sent.channels)).toEqual([["sms", "email"], ["email"]]);
  expect([state.uploads, state.completes, state.puts]).toEqual([1, 1, 1]);
});

test("an accepted send with a history warning stays visible and cannot be retried", async ({ page }) => {
  const state = await harness(page, "warning");
  await page.goto(`${BASE}/messages`);
  await page.getByRole("button", { name: "New message", exact: true }).click();
  await page.getByRole("button", { name: /Test client/ }).click();
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("A test update.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/The message was sent, but its history could not be saved/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry remaining channels" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "SMS sent", exact: true })).toBeDisabled();
  expect(state.sends).toHaveLength(1);
});

test("a full image batch keeps Send above the mobile navigation", async ({ page }) => {
  const state = await harness(page);
  await page.goto(`${BASE}/messages?thread=${encodeURIComponent(smsThread.id)}`);
  await page.locator('.chat-composer input[type="file"]').setInputFiles(Array.from({ length: 10 }, (_, index) => ({ name: `loan-${index + 1}.png`, mimeType: "image/png", buffer: Buffer.from(PNG, "base64") })));
  await expect(page.locator(".message-image-draft")).toHaveCount(10);
  const send = page.getByRole("button", { name: "Send message", exact: true });
  await expect(send).toBeEnabled();
  const sendBounds = await send.boundingBox();
  const nav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  if (await nav.isVisible()) {
    const navBounds = await nav.boundingBox();
    expect(sendBounds!.y + sendBounds!.height).toBeLessThanOrEqual(navBounds!.y);
  }
  expect(state.uploads).toBe(0);
});
