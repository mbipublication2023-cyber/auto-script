const puppeteer = require('puppeteer');

(async () => {
    // 1. Launch Browser
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log('--- Starting Script: Cart & Checkout Automation (Debug Mode) ---');

        // 1. Goto mbi.com.pk
        console.log('1. Navigating to mbi.com.pk...');
        await page.goto('https://mbi.com.pk', { waitUntil: 'networkidle2', timeout: 60000 });

        // 2. Close modal
        try {
            const closeBtnSelector = '.close-popup, .p-close, .popup-close, .modal-close, i.fa-times';
            const closeBtn = await page.waitForSelector(closeBtnSelector, { timeout: 3000, visible: true });
            if (closeBtn) {
                console.log('   Modal detected. Closing...');
                await closeBtn.click();
            }
        } catch (e) { /* ignore */ }

        // Helper to get links
        const getProductLinks = async () => {
            return await page.$$eval('.wc-block-grid__product-link, .product-title a, .woocommerce-loop-product__link', els => els.map(e => e.href));
        };

        const allLinks = await getProductLinks();
        // Filter valid product links
        const productLinks = [...new Set(allLinks)].filter(l => !l.endsWith('mbi.com.pk/') && !l.includes('/cart/') && !l.includes('/my-account/'));

        if (productLinks.length < 2) throw new Error('Not enough products found.');

        // 3. Select Product 1 & Add
        const link1 = productLinks[Math.floor(Math.random() * productLinks.length)];
        console.log(`3. Selected Product 1: ${link1}`);
        await page.goto(link1, { waitUntil: 'domcontentloaded' });

        console.log('4. Clicking Add to Cart...');
        try {
            const btnSelector = 'button.single_add_to_cart_button';
            await page.waitForSelector(btnSelector, { timeout: 10000 });
            await page.click(btnSelector);
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error('   Failed to click Add to Cart (Product 1)');
        }

        // 5. Select Product 2 & Add
        let link2 = productLinks[Math.floor(Math.random() * productLinks.length)];
        while (link2 === link1) link2 = productLinks[Math.floor(Math.random() * productLinks.length)];


        console.log(`5. Selected Product 2: ${link2}`);
        await page.goto(link2, { waitUntil: 'domcontentloaded' });

        console.log('6. Clicking Add to Cart...');
        try {
            const btnSelector = 'button.single_add_to_cart_button';
            await page.waitForSelector(btnSelector, { timeout: 10000 });
            await page.click(btnSelector);
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error('   Failed to click Add to Cart (Product 2)');
        }

        // 7. Proceed to Checkout
        console.log('7. Proceeding to Checkout...');
        await page.goto('http://mbi.com.pk/checkout/', { waitUntil: 'networkidle2' });

        // Generate Random Data
        // Load users from users.json
        const fs = require('fs');
        const path = require('path');
        const usersPath = path.resolve(__dirname, 'users.json');

        let selectedUser;
        try {
            const usersData = fs.readFileSync(usersPath, 'utf8');
            const users = JSON.parse(usersData);
            console.log(users.length)
            if (users.length > 0) {
                selectedUser = users[Math.floor(Math.random() * users.length)];
                console.log(`   Loaded ${users.length} users. Selected: ${selectedUser.firstName} ${selectedUser.lastName}`);
            } else {
                throw new Error('users.json is empty');
            }
        } catch (err) {
            console.error('   Failed to load users.json, falling back to random data:', err.message);
            // Fallback to random data if file fails
            const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            selectedUser = {
                firstName: `User${randomInt(100, 999)}`,
                lastName: `Test${randomInt(100, 999)}`,
                address: `House ${randomInt(1, 100)}, Street ${randomInt(1, 20)}`,
                city: 'Karachi',
                zip: '75000',
                phone: `0300${randomInt(1000000, 9999999)}`,
                email: `automator${randomInt(1000, 9999)}@test.com`
            };
        }

        const { firstName: fname, lastName: lname, address, city, zip, phone, email } = selectedUser;

        console.log(`   Data: ${fname} ${lname}, ${address}, ${phone}`);

        // 8. Fill Form (JS)
        console.log('8. Filling Checkout Form (via JS)...');

        // Handle "Ship to different address" FIRST because it triggers AJAX
        await page.evaluate(() => {
            const shipCheck = document.querySelector('#ship-to-different-address-checkbox');
            if (shipCheck && shipCheck.checked) {
                shipCheck.click();
            }
        });

        console.log('   Waiting for potential AJAX after checkbox...');
        await new Promise(r => setTimeout(r, 4000));

        const fillField = async (sel, val) => {
            await page.waitForSelector(sel, { visible: true, timeout: 5000 }).catch(() => { });
            await page.evaluate((selector, value) => {
                const el = document.querySelector(selector);
                if (el) {
                    el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            }, sel, val);
        };

        await fillField('#billing_first_name', fname);
        await fillField('#billing_last_name', lname);
        await fillField('#billing_address_1', address);
        await fillField('#billing_city', city);
        await fillField('#billing_postcode', zip);
        await fillField('#billing_phone', phone);
        await fillField('#billing_email', email);

        // Check Terms
        await page.evaluate(() => {
            const terms = document.querySelector('#terms');
            if (terms && !terms.checked) terms.click();
        });

        // Wait for ajax before submit
        await new Promise(r => setTimeout(r, 2000));


        // Submit
        console.log('   Submitting Order...');
        await page.evaluate(() => {
            const overlays = document.querySelectorAll('.blockUI');
            overlays.forEach(el => el.remove());
        });

        const placeOrderBtn = '#place_order';
        await page.waitForSelector(placeOrderBtn);
        await page.evaluate((sel) => document.querySelector(sel).click(), placeOrderBtn);

        console.log('   Clicked Place Order. Polling for 30s...');

        // Poll for state
        const startTime = Date.now();
        let finalState = 'timeout';

        while (Date.now() - startTime < 30000) {
            const currentUrl = page.url();

            // Check Success
            if (currentUrl.includes('order-received')) {
                console.log('   SUCCESS: Landed on Order Received page!');
                finalState = 'success';
                break;
            }

            // Check Cart Redirect
            if (currentUrl.includes('/cart') || await page.$('.cart-empty')) {
                // Double check if empty
                const emptyMsg = await page.$('.cart-empty');
                if (emptyMsg) {
                    console.log('   WARNING: Redirected to Empty Cart page.');
                    finalState = 'empty_cart';
                    break;
                }
            }

            // Check Error
            const errorMsg = await page.$eval('.woocommerce-error', el => el.textContent.trim()).catch(() => null);
            if (errorMsg) {
                console.log(`   FORM ERROR: ${errorMsg}`);
                finalState = 'error';
                break;
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        // Check if form was reset
        try {
            const firstNameVal = await page.$eval('#billing_first_name', el => el.value);
            if (!firstNameVal) {
                console.log('   OBSERVATION: Billing First Name is EMPTY. The form was RESET.');
            } else {
                console.log(`   OBSERVATION: Billing First Name still has value: "${firstNameVal}". Form NOT reset.`);
            }
        } catch (e) {
            console.log('   Could not check form value: ' + e.message);
        }

        console.log(`   Final State: ${finalState} `);
        console.log(`   End URL: ${page.url()} `);

        // const screenshotPath = require('path').resolve('final_checkout_debug.png');
        // await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   Saved screenshot: ${screenshotPath} `);

    } catch (error) {
        console.error('Script Failed:', error);
        // await page.screenshot({ path: 'fatal_error.png' });
    } finally {
        console.log('--- Finished. Closing in 10s ---');
        setTimeout(async () => {
            await browser.close();
        }, 10000);
    }
})();
