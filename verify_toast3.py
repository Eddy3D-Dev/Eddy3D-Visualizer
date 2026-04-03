import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(record_video_dir=".")
        page = await context.new_page()

        print("Navigating to local dev server...")
        await page.goto("http://localhost:5173")
        await page.wait_for_load_state("networkidle")

        print("Triggering toast via evaluate...")
        await page.evaluate('import("/src/main.ts").then(m => m.showToast("Test error message", true))')

        print("Waiting for toast to appear...")
        toast = page.locator(".toast.toast-error")
        await toast.wait_for(state="visible", timeout=2000)

        print("Taking screenshot of the toast and close button...")
        await page.screenshot(path="verification.png")

        print("Clicking the close button...")
        close_btn = page.locator(".toast-close")
        await close_btn.click()

        print("Waiting for toast to disappear...")
        await toast.wait_for(state="hidden", timeout=2000)

        print("Toast closed successfully.")
        await context.close()
        await browser.close()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
