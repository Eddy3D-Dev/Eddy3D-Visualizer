import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    with open("empty.csv", "w") as f:
        f.write("\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(record_video_dir=".")
        page = await context.new_page()

        print("Navigating to local dev server...")
        await page.goto("http://localhost:5173")
        await page.wait_for_load_state("networkidle")

        print("Uploading empty file...")
        await page.set_input_files("#file-input", "empty.csv")

        # We also need to manually trigger the change event if set_input_files didn't
        await page.evaluate("document.getElementById('file-input').dispatchEvent(new Event('change'))")

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
