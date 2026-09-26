export default async function run(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);

  // Switch to English to match the user's screenshot
  await page.locator('#langBtn').click();
  await page.waitForTimeout(300);

  // Switch to register view
  await page.locator('[data-action="go-register"]').first().click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: 'C:/Users/user/Downloads/psyai/verify_register_desktop.png', fullPage: false });

  // Mobile check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/user/Downloads/psyai/verify_register_mobile.png', fullPage: false });

  return { ok: true };
}
