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

        print("Waiting for page load...")
        await page.locator("label[for='csv-upload']").wait_for()

        print("Triggering actual toast through evaluated JS function...")
        # Get reference to the actual `showToast` via a backdoor or by dispatching an event if possible.
        # Let's try to assign it to window in main.ts temporarily using a sed replacement, run it, then revert it.
        # Wait, since the user already did `export function showToast`, maybe we can import it.
        await page.evaluate("""() => {
            import('/src/main.ts').then(module => {
                window.__showToast = module.showToast;
                window.__showToast('Verification test error', true);
            });
        }""")

        print("Waiting for toast to appear...")
        # Since toast is styled with .toast, let's wait for any element with .toast to be in DOM
        toast = page.locator(".toast")
        await toast.wait_for(state="attached", timeout=5000)

        # force visibility check
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
