import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Record video to the current directory
        context = await browser.new_context(record_video_dir=".")
        page = await context.new_page()

        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        print("Navigating to local dev server...")
        await page.goto("http://localhost:5173")
        await page.wait_for_load_state("networkidle")

        print("Executing script to show toast natively bypassing React/Vue/etc directly in window...")
        # To make sure it renders we inject a raw script tag into the page that calls showToast.
        # But wait, Vite uses modules. We can do a dynamic import
        await page.evaluate("""() => {
            import('/src/main.ts').then((module) => {
                console.log("Module loaded:", module);
                if (module.showToast) {
                    module.showToast("Test notification from Playwright script", true);
                } else {
                    console.error("showToast not found in module");
                }
            }).catch(console.error);
        }""")

        print("Waiting for toast to appear...")
        # Since css classes might be stripped or minified in preview? No we are on port 5173 which is dev.
        # Let's wait for any div with role alert or id toast-container children
        toast_container = page.locator("#toast-container")
        await toast_container.wait_for(state="attached", timeout=5000)

        toast = page.locator(".toast")
        await toast.wait_for(state="visible", timeout=5000)

        print("Hovering over toast to pause dismiss...")
        await toast.hover()

        # Wait a bit to ensure hover works and it doesn't auto-dismiss
        await page.wait_for_timeout(2000)

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
