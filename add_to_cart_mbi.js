const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: process.env.CI ? true : false,
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

    // ─── Helper: fill field by typing (fires native events) ──────────────────
    const typeInto = async (selector, value) => {
        try {
            await page.waitForSelector(selector, { visible: true, timeout: 4000 });
            await page.click(selector, { clickCount: 3 }); // select all existing text
            await page.keyboard.press('Backspace');
            await page.type(selector, String(value), { delay: 40 });
            // Trigger framework events
            await page.evaluate(sel => {
                const el = document.querySelector(sel);
                if (!el) return;
                ['input', 'change', 'blur'].forEach(evt =>
                    el.dispatchEvent(new Event(evt, { bubbles: true }))
                );
            }, selector);
            return true;
        } catch (_) {
            return false;
        }
    };

    // ─── Helper: try multiple selectors to fill a field ────────────────────────
    const fillField = async (selectors, value, label) => {
        for (const sel of selectors) {
            const ok = await typeInto(sel, value);
            if (ok) {
                console.log(`   ✔ Filled ${label} (using: ${sel})`);
                return true;
            }
        }
        console.warn(`   ✖ WARN: Could not fill ${label}`);
        return false;
    };

    try {
        console.log('--- Shopify Fake Order Script (mbi.com.pk) ---');

        // ── 1. Products from /collections/all ────────────────────────────────
        console.log('1. Collecting products...');
        await page.goto('https://mbi.com.pk/collections/all', { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 3000));

        const productLinks = await page.$$eval(
            'a[href*="/products/"]',
            els => [...new Set(els.map(e => e.href).filter(h => h.includes('/products/') && !h.includes('?')))]
        );
        console.log(`   Found ${productLinks.length} products.`);
        if (!productLinks.length) throw new Error('No products found on /collections/all');

        // ── 2. Load user ──────────────────────────────────────────────────────
        const fs = require('fs');
        const path = require('path');
        let u;
        try {
            const users = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'users.json'), 'utf8'));
            u = users[Math.floor(Math.random() * users.length)];
            console.log(`2. User: ${u.firstName} ${u.lastName} | ${u.email} | ${u.phone}`);
        } catch (err) {
            const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
            u = {
                firstName: `Test${ri(100, 999)}`, lastName: `User${ri(100, 999)}`,
                address: `House ${ri(1, 99)}, Street ${ri(1, 20)}, Gulshan-e-Iqbal`,
                city: 'Karachi', zip: '75300',
                phone: `0300${ri(1000000, 9999999)}`,
                email: `fake${ri(1000, 9999)}@example.com`
            };
            console.log(`2. Fallback user: ${u.firstName} ${u.lastName}`);
        }

        // ── 3 & 4. Add 2 random products to cart ─────────────────────────────
        const shuffled = [...productLinks].sort(() => Math.random() - 0.5).slice(0, 2);
        for (let i = 0; i < shuffled.length; i++) {
            console.log(`${3 + i}. Adding: ${shuffled[i]}`);
            await page.goto(shuffled[i], { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));
            let added = false;
            for (const sel of ['button[name="add"]', 'form[action*="/cart/add"] button[type="submit"]', 'button.product-form__submit', 'button#AddToCart']) {
                try {
                    await page.waitForSelector(sel, { timeout: 4000 });
                    await page.click(sel);
                    console.log(`   ✔ Added via ${sel}`);
                    added = true;
                    break;
                } catch (_) {}
            }
            if (!added) console.warn(`   ✖ Could not add product ${i + 1}`);
            await new Promise(r => setTimeout(r, 3000));
        }

        // ── 5. Go to cart ─────────────────────────────────────────────────────
        console.log('5. Cart...');
        await page.goto('https://mbi.com.pk/cart', { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        // ── 6. Checkout ───────────────────────────────────────────────────────
        console.log('6. Checkout...');
        let reachedCheckout = false;
        for (const sel of ['button[name="checkout"]', 'input[name="checkout"]', 'button.cart__checkout-button', 'a[href="/checkout"]']) {
            try {
                await page.waitForSelector(sel, { timeout: 4000 });
                await page.click(sel);
                reachedCheckout = true;
                break;
            } catch (_) {}
        }
        if (!reachedCheckout) {
            await page.goto('https://mbi.com.pk/checkout', { waitUntil: 'networkidle2', timeout: 30000 });
        }

        await new Promise(r => setTimeout(r, 6000));
        console.log(`   URL: ${page.url()}`);

        // ── 7. Fill checkout form ─────────────────────────────────────────────
        console.log('7. Filling form...');

        // Contact: email or phone field
        await fillField(
            ['input#email', 'input[name="email"]', 'input[placeholder*="Email"]', 'input[placeholder*="mobile phone"]'],
            u.email,
            'email'
        );

        // First Name
        await fillField(
            ['input[name="firstName"]', 'input[placeholder*="First name"]', 'input[placeholder*="first name"]'],
            u.firstName,
            'firstName'
        );

        // Last Name
        await fillField(
            ['input[name="lastName"]', 'input[placeholder*="Last name"]', 'input[placeholder*="last name"]'],
            u.lastName,
            'lastName'
        );

        // Address — Shopify shows a single "Address" field with autocomplete
        // We need to try standard name, or placeholder, dismiss autocomplete, and type freely
        let addressFilled = false;
        const addressSelectors = ['input[name="address1"]', 'input[placeholder*="Address"]', 'input[placeholder*="address"]'];
        for (const sel of addressSelectors) {
            try {
                await page.waitForSelector(sel, { visible: true, timeout: 3000 });
                await page.click(sel, { clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.type(sel, u.address, { delay: 60 });
                // Press Escape to dismiss autocomplete dropdown
                await page.keyboard.press('Escape');
                await new Promise(r => setTimeout(r, 500));
                // Trigger events
                await page.evaluate(selectorStr => {
                    const el = document.querySelector(selectorStr);
                    if (el) ['input', 'change', 'blur'].forEach(e => el.dispatchEvent(new Event(e, { bubbles: true })));
                }, sel);
                console.log(`   ✔ Filled address (using: ${sel})`);
                addressFilled = true;
                break;
            } catch (_) {}
        }
        if (!addressFilled) {
            console.warn('   ✖ WARN: Could not fill address');
        }

        // City
        await fillField(
            ['input[name="city"]', 'input[placeholder*="City"]', 'input[placeholder*="city"]'],
            u.city,
            'city'
        );

        // Postal/Zip
        await fillField(
            ['input[name="postalCode"]', 'input[placeholder*="Postal"]', 'input[placeholder*="postal"]', 'input[placeholder*="ZIP"]'],
            u.zip,
            'postalCode'
        );

        // Phone
        await fillField(
            ['input[name="phone"]', 'input[placeholder*="Phone"]', 'input[placeholder*="phone"]'],
            u.phone,
            'phone'
        );

        await new Promise(r => setTimeout(r, 2000));

        // ── 8. Submit ─────────────────────────────────────────────────────────
        console.log('8. Submitting...');
        // Try pay / continue button
        const btnSels = ['button#checkout-pay-button', 'button[type="submit"]'];
        for (const sel of btnSels) {
            try {
                const btn = await page.$(sel);
                if (btn) {
                    const isDisabled = await page.evaluate(el => el.disabled, btn);
                    console.log(`   Button "${sel}" disabled=${isDisabled}`);
                    await page.evaluate(el => el.click(), btn);
                    console.log(`   Clicked: ${sel}`);
                    break;
                }
            } catch (_) {}
        }

        // ── 9. Poll ───────────────────────────────────────────────────────────
        console.log('9. Polling for result (60s)...');
        const t0 = Date.now();
        let state = 'timeout';

        while (Date.now() - t0 < 60000) {
            const url = page.url();
            if (url.includes('thank_you') || url.includes('thank-you') || url.includes('order_id')) {
                console.log(`   ✔ SUCCESS: ${url}`);
                state = 'success';
                break;
            }
            if (url.includes('/payment') || url.includes('/delivery') || url.includes('/shipping')) {
                console.log(`   ✔ Progressing in checkout: ${url}`);
                state = 'checkout_progress';
                break;
            }
            const errEl = await page.$('[data-testid="error"], .notice--error, .field__message--error').catch(() => null);
            if (errEl) {
                const txt = await page.evaluate(el => el.textContent.trim(), errEl).catch(() => '');
                console.log(`   ✖ Error: ${txt}`);
                state = 'form_error';
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log(`\n=== RESULT: ${state.toUpperCase()} ===`);
        console.log(`=== URL: ${page.url()} ===\n`);

        const ssPath = path.resolve(__dirname, 'final_checkout_debug.png');
        await page.screenshot({ path: ssPath, fullPage: true });
        console.log(`Screenshot: ${ssPath}`);

        // ── 10. Write Log to File ─────────────────────────────────────────────
        try {
            const logPath = path.resolve(__dirname, 'execution_log.json');
            let logData = {};
            if (fs.existsSync(logPath)) {
                try {
                    logData = JSON.parse(fs.readFileSync(logPath, 'utf8'));
                } catch (_) {}
            }
            
            // Increment today's order count
            const todayStr = new Date().toISOString().split('T')[0];
            if (state === 'success') {
                logData[todayStr] = (logData[todayStr] || 0) + 1;
            }

            // Save detailed orders array
            if (!logData.orders) logData.orders = [];
            logData.orders.push({
                timestamp: new Date().toISOString(),
                localTime: new Date().toLocaleString(),
                website: 'mbi.com.pk',
                status: state.toUpperCase(),
                customer: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
                email: u.email,
                phone: u.phone,
                url: page.url()
            });

            fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
            const successOrders = logData.orders.filter(o => o.status === 'SUCCESS').length;
            console.log(`   ✔ Log updated in execution_log.json (Today's count: ${logData[todayStr] || 0} | Total successful orders: ${successOrders})`);
        } catch (logErr) {
            console.warn('   WARN: Could not write log to file:', logErr.message);
        }

    } catch (err) {
        console.error('FATAL:', err.message);
        try {
            await page.screenshot({ path: require('path').resolve(__dirname, 'fatal_error.png') });
        } catch (_) {}
    } finally {
        console.log('--- Done. Closing in 10s ---');
        setTimeout(() => browser.close(), 10000);
    }
})();
