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

        print("Navigating to local preview server (port 4173)...")
        await page.goto("http://localhost:4173")
        await page.wait_for_load_state("networkidle")

        print("Executing script to mock showToast injection natively...")
        await page.evaluate("""() => {
            const toast = document.createElement('div');
            toast.className = 'toast toast-error show';
            toast.id = 'my-custom-toast';
            toast.textContent = 'Hello World';
            document.body.appendChild(toast);
        }""")

        print("Waiting for toast to appear...")
        toast = page.locator("#my-custom-toast")
        await toast.wait_for(state="attached", timeout=5000)

        await page.screenshot(path="verification.png")

        await context.close()
        await browser.close()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
