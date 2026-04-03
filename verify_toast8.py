import asyncio
from playwright.async_api import async_playwright

async def main():
    with open("invalid.csv", "w") as f:
        f.write("a,b,c\n1,2,3")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(record_video_dir=".")
        page = await context.new_page()

        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        print("Navigating to local dev server...")
        await page.goto("http://localhost:5173")
        await page.wait_for_load_state("networkidle")

        print("Waiting for page load...")
        await page.locator("text=Upload Files").wait_for()

        # Try to make the file input interactable temporarily
        await page.evaluate("document.getElementById('csv-upload').classList.remove('sr-only')")
        await page.evaluate("document.getElementById('csv-upload').style.display = 'block'")
        await page.evaluate("document.getElementById('csv-upload').style.opacity = '1'")

        print("Uploading invalid file...")
        await page.set_input_files("#csv-upload", "invalid.csv")

        print("Waiting for toast to appear...")
        toast = page.locator(".toast-error")
        await toast.wait_for(state="visible", timeout=10000)

        print("Taking screenshot of the toast and close button...")
        await page.screenshot(path="verification.png")

        print("Clicking the close button...")
        close_btn = page.locator(".toast-close")
        await close_btn.click()

        print("Waiting for toast to disappear...")
        await toast.wait_for(state="hidden", timeout=5000)

        print("Toast closed successfully.")
        await context.close()
        await browser.close()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
