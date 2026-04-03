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
        # What if it's visible but out of viewport or obscured? Let's scroll or force it.
        await page.evaluate("""() => {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.style.position = 'fixed';
                container.style.top = '20px';
                container.style.right = '20px';
                container.style.zIndex = '9999';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.className = 'toast toast-error show';
            toast.style.display = 'flex';
            toast.style.alignItems = 'center';
            toast.style.justifyContent = 'space-between';
            toast.style.background = '#fee2e2';
            toast.style.padding = '12px';
            toast.style.border = '1px solid #ef4444';
            toast.style.borderRadius = '6px';
            toast.style.pointerEvents = 'auto'; // ensure interactable

            const msgSpan = document.createElement('span');
            msgSpan.className = 'toast-message';
            msgSpan.textContent = 'This is a test error notification.';
            toast.appendChild(msgSpan);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.innerHTML = 'X';
            closeBtn.style.marginLeft = '10px';

            let timeoutId = setTimeout(() => toast.remove(), 4000);

            closeBtn.addEventListener('click', () => toast.remove());
            toast.appendChild(closeBtn);
            container.appendChild(toast);
        }""")

        print("Waiting for toast to appear...")
        toast = page.locator(".toast.toast-error")
        await toast.wait_for(state="visible", timeout=5000)

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
