import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.goto("http://localhost:5173")

        await page.evaluate("""() => {
            const style = document.createElement('style');
            style.textContent = `
              .custom-file-upload {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                gap: 6px;
              }
              .btn-icon { flex-shrink: 0; }
            `;
            document.head.appendChild(style);

            const fileBtns = document.querySelectorAll('label[for$="csv-upload"]');
            fileBtns.forEach(lbl => {
              const input = lbl.querySelector('input');
              lbl.innerHTML = `<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>Upload Files`;
              lbl.appendChild(input);
            });

            const folderBtns = document.querySelectorAll('label[for$="folder-upload"]');
            folderBtns.forEach(lbl => {
              const input = lbl.querySelector('input');
              lbl.innerHTML = `<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>Upload Folder`;
              lbl.appendChild(input);
            });
        }""")

        await page.wait_for_timeout(2000)
        await page.screenshot(path="ui_icons.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
