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
        console.log('--- Starting Script: Cart & Checkout Automation for SouqElite.pk ---');

        // 1. Goto SouqElite homepage
        console.log('1. Navigating to https://souqelite.pk/ ...');
        await page.goto('https://souqelite.pk/', { waitUntil: 'networkidle2', timeout: 60000 });

        // Helper to get product links
        // SouqElite products usually have /products/ in the URL
        const getProductLinks = async () => {
            return await page.$$eval('a[href*="/products/"]', els => els.map(e => e.href));
        };

        let productLinks = await getProductLinks();
        // Filter valid product links and deduplicate
        productLinks = [...new Set(productLinks)].filter(l => l.includes('/products/') && !l.includes('page='));

        console.log(`   Found ${productLinks.length} product links.`);

        if (productLinks.length === 0) {
            console.log('   No products found on home page, trying collection page...');
            await page.goto('https://souqelite.pk/collections/all', { waitUntil: 'networkidle2' });
            productLinks = await getProductLinks();
            productLinks = [...new Set(productLinks)].filter(l => l.includes('/products/'));
        }

        if (productLinks.length < 1) throw new Error('Not enough products found.');

        // 2. Select a Random Product
        const link = productLinks[Math.floor(Math.random() * productLinks.length)];
        console.log(`2. Selected Product: ${link}`);
        await page.goto(link, { waitUntil: 'domcontentloaded' });

        // 3. Click Add to Cart
        console.log('3. Clicking Add to Cart...');
        try {
            // Updated selector based on subagent findings
            const btnSelector = 'button.t4s-product-form__submit, button[name="add"]';
            await page.waitForSelector(btnSelector, { timeout: 10000 });
            await page.click(btnSelector);

            // Wait for cart action (drawer or notification)
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) {
            console.error('   Failed to click Add to Cart', e);
            throw e;
        }

        // 4. Proceed to Checkout
        console.log('4. Proceeding to Checkout...');
        // Force navigate to checkout to be safe
        await page.goto('https://souqelite.pk/checkout', { waitUntil: 'networkidle2' });

        // Generate Random Data
        const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const fname = `User${randomInt(100, 999)}`;
        const lname = `Test${randomInt(100, 999)}`;
        const address = `House ${randomInt(1, 100)}, Street ${randomInt(1, 20)}`;
        const city = 'Karachi';
        const zip = '75000';
        const phone = `0300${randomInt(1000000, 9999999)}`;
        const email = `automator${randomInt(1000, 9999)}@gmail.com`;

        console.log(`   Data: ${fname} ${lname}, ${address}, ${phone}, ${email}`);

        // 5. Fill Checkout Form
        console.log('5. Filling Checkout Form...');

        // Helper to type into fields by name attribute (more robust for Shopify)
        const typeByName = async (name, value) => {
            const selector = `[name="${name}"]`;
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                await page.type(selector, value, { delay: 50 });
            } catch (e) {
                // Try by ID or other heuristic if name fails, but name is standard Shopify
                console.log(`   Could not find field by name="${name}", trying fallback...`);
            }
        };

        // Standard Shopify Checkout Fields
        await typeByName('email', email);
        await typeByName('firstName', fname);
        await typeByName('lastName', lname);
        await typeByName('address1', address);
        await typeByName('address2', `Apt ${randomInt(1, 50)}`); // Added required field
        await typeByName('city', city);
        await typeByName('postalCode', zip);
        await typeByName('phone', phone);

        console.log('   Form filled.');

        // 6. Handle "Continue to shipping" button
        // Shopify usually has a "Continue to shipping" button first
        const continueBtnSelector = '#continue_button, button[type="submit"]';
        // Note: We might need to handle multiple steps. 
        // We will try to click continue and see where we land.

        console.log('6. Clicking Continue...');
        try {
            await page.waitForSelector(continueBtnSelector, { timeout: 5000 });
            await page.click(continueBtnSelector);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        } catch (e) {
            console.log('   Wait/Click continue timed out or failed. Check if we are already at payment.');
        }

        // Pause for observation (since we don't want to actually buy)
        console.log('   Paused for 10 seconds to verify state...');
        await new Promise(r => setTimeout(r, 10000));

    } catch (error) {
        console.error('Script Failed:', error);
        await page.screenshot({ path: 'souqelite_error.png' });
    } finally {
        console.log('--- Finished. Closing in 5s ---');
        setTimeout(async () => {
            await browser.close();
        }, 5000);
    }
})();
