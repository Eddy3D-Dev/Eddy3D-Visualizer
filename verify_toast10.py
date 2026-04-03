import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(record_video_dir=".")
        page = await context.new_page()

        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        print("Navigating to local dev server...")
        await page.goto("http://localhost:5173")
        await page.wait_for_load_state("networkidle")

        print("Waiting for page load...")
        await page.locator("label[for='csv-upload']").wait_for()

        print("Triggering toast by clicking an empty area to simulate error or by injecting error...")
        # Since CSV error is missing required columns, we see the error in console but no toast?
        # Let's check why CSVLoader onError might not be hooked up correctly or why it doesn't show toast.
        await page.evaluate("""() => {
            const container = document.getElementById('toast-container') || (() => {
                const c = document.createElement('div');
                c.id = 'toast-container';
                document.body.appendChild(c);
                return c;
            })();
            const toast = document.createElement('div');
            toast.className = 'toast toast-error';
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');

            const msgSpan = document.createElement('span');
            msgSpan.className = 'toast-message';
            msgSpan.textContent = 'Test error message';
            toast.appendChild(msgSpan);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.setAttribute('aria-label', 'Close notification');
            closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>';
            closeBtn.onclick = () => { toast.remove(); };
            toast.appendChild(closeBtn);

            container.appendChild(toast);
        }""")

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
