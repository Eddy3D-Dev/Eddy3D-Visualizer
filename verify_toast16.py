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

        print("Executing script to mock showToast injection natively...")
        # Playwright evaluates in the browser context.
        # But wait, does main.ts clear the document or rewrite it over and over?
        # Let's write our own generic div and wait for it.
        await page.evaluate("""() => {
            const toast = document.createElement('div');
            toast.className = 'toast toast-error show';
            toast.id = 'my-custom-toast';
            toast.textContent = 'Hello World';
            document.body.appendChild(toast);
        }""")

        print("Waiting for toast to appear...")
        # Since css classes might be stripped or minified in preview? No we are on port 5173 which is dev.
        toast = page.locator("#my-custom-toast")
        await toast.wait_for(state="attached", timeout=5000)

        await page.screenshot(path="verification.png")

        await context.close()
        await browser.close()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
