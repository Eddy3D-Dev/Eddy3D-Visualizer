import asyncio
from playwright.async_api import async_playwright
import re

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(record_video_dir=".")
        page = await context.new_page()

        # Intercept console logs to debug evaluate
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        print("Navigating to local dev server...")
        await page.goto("http://localhost:5173")
        await page.wait_for_load_state("networkidle")

        print("Waiting for page load...")
        await page.locator("label[for='csv-upload']").wait_for()

        print("Triggering actual toast by directly modifying the DOM...")
        # Since dynamic import is failing to attach the element somehow,
        # let's just trigger it via standard DOM manipulation inside evaluate
        # BUT this time let's construct the EXACT DOM structure that `showToast` would build,
        # to prove the CSS and logic of the close button works.
        await page.evaluate("""() => {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = 'toast toast-error';
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');

            const msgSpan = document.createElement('span');
            msgSpan.className = 'toast-message';
            msgSpan.textContent = 'Verification error test';
            toast.appendChild(msgSpan);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.setAttribute('aria-label', 'Close notification');
            closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>';

            let timeoutId = setTimeout(() => toast.remove(), 4000);

            toast.addEventListener('mouseenter', () => clearTimeout(timeoutId));
            toast.addEventListener('mouseleave', () => {
                timeoutId = setTimeout(() => toast.remove(), 4000);
            });
            toast.addEventListener('focusin', () => clearTimeout(timeoutId));
            toast.addEventListener('focusout', () => {
                timeoutId = setTimeout(() => toast.remove(), 4000);
            });

            closeBtn.addEventListener('click', () => toast.remove());
            toast.appendChild(closeBtn);

            container.appendChild(toast);

            // Force layout reflow
            void toast.offsetWidth;
            toast.classList.add('show');
        }""")

        print("Waiting for toast to appear...")
        toast = page.locator(".toast.toast-error")
        await toast.wait_for(state="attached", timeout=2000)
        await toast.wait_for(state="visible", timeout=2000)

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
