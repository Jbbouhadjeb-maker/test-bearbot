const puppeteer = require('puppeteer');

/**
 * Automated Kingshot Gift Code Redeemer
 * Falls back to API submission if Puppeteer browser launch fails
 * Simulates real user interactions when possible
 */
class KingshotAutoRedeem {
    constructor() {
        this.browser = null;
        this.name = 'Kingshot Auto Redeem';
        this.lastError = null;
        this.puppeteerAvailable = true;
        this.browserOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
            ],
        };
    }

    /**
     * Initialize the browser
     */
    async initialize() {
        try {
            if (!this.browser && this.puppeteerAvailable) {
                this.browser = await puppeteer.launch(this.browserOptions);
                console.log('[KingshotAutoRedeem] Browser launched');
            }
        } catch (error) {
            this.lastError = error.message;
            console.warn('[KingshotAutoRedeem] Puppeteer unavailable, using API fallback:', error.message);
            this.puppeteerAvailable = false;
        }
    }

    /**
     * Shutdown the browser
     */
    async shutdown() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                console.log('[KingshotAutoRedeem] Browser closed');
            }
        } catch (error) {
            console.error('[KingshotAutoRedeem] Error closing browser:', error.message);
        }
    }

    /**
     * Redeem a gift code for a specific player
     */
    async redeemCode(code, playerId, kingdom) {
        if (!code || !playerId || !kingdom) {
            return {
                status: 'invalid_input',
                message: 'Missing code, playerId, or kingdom',
                code
            };
        }

        // If Puppeteer is available, use full browser automation
        if (this.puppeteerAvailable && this.browser) {
            return await this.redeemWithPuppeteer(code, playerId, kingdom);
        }

        // Otherwise, use fallback API mode
        return await this.redeemWithAPI(code, playerId, kingdom);
    }

    /**
     * Redeem using Puppeteer browser automation
     */
    async redeemWithPuppeteer(code, playerId, kingdom) {
        let page = null;

        try {
            page = await this.browser.newPage();
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            );

            console.log(`[KingshotAutoRedeem] Navigating to Kingshot...`);
            await page.goto('https://kingshot.net/gift-codes', {
                waitUntil: 'networkidle2',
                timeout: 30000,
            });

            await page.waitForTimeout(2000);

            const formFound = await page.evaluate(() => {
                const form = document.querySelector('form[action*="redeem"]') ||
                    document.querySelector('form') ||
                    document.querySelector('[action*="redeem"]') ||
                    document.querySelector('input[placeholder*="code" i]');
                return !!form;
            });

            if (!formFound) {
                console.log('[KingshotAutoRedeem] Form not found, trying API');
                return await this.tryDirectSubmission(page, code, playerId, kingdom);
            }

            console.log(`[KingshotAutoRedeem] Filling code: ${code}`);
            const inputSelector = 'input[placeholder*="code" i], input[name*="code" i], input[type="text"]';
            
            await page.focus(inputSelector);
            await page.keyboard.type(code, { delay: 50 });

            const playerIdInput = await page.$('input[placeholder*="player" i], input[name*="player" i]');
            if (playerIdInput) {
                console.log(`[KingshotAutoRedeem] Filling player ID: ${playerId}`);
                await playerIdInput.focus();
                await page.keyboard.type(playerId, { delay: 50 });
            }

            const kingdomInput = await page.$('input[placeholder*="kingdom" i], input[name*="kingdom" i]');
            if (kingdomInput) {
                console.log(`[KingshotAutoRedeem] Filling kingdom: ${kingdom}`);
                await kingdomInput.focus();
                await page.keyboard.type(kingdom, { delay: 50 });
            }

            await page.waitForTimeout(1000);

            const captchaHandled = await this.handleCaptcha(page);
            if (captchaHandled === false) {
                return {
                    status: 'captcha_unsolvable',
                    message: 'CAPTCHA detected but could not be solved automatically',
                    code
                };
            }

            console.log('[KingshotAutoRedeem] Submitting form...');
            const submitButton = await page.$(
                'button[type="submit"], button:contains("Redeem"), button:contains("Submit"), input[type="submit"]'
            );

            if (submitButton) {
                await submitButton.click();
            } else {
                await page.keyboard.press('Enter');
            }

            await page.waitForTimeout(3000);

            const result = await this.checkRedemptionResult(page, code);
            return result;

        } catch (error) {
            this.lastError = error.message;
            console.error(`[KingshotAutoRedeem] Puppeteer error:`, error.message);
            return {
                status: 'error',
                message: error.message,
                code
            };
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    }

    /**
     * Fallback: Redeem using direct API submission (no browser)
     */
    async redeemWithAPI(code, playerId, kingdom) {
        try {
            console.log(`[KingshotAutoRedeem] Using API mode for ${code}`);

            const endpoints = [
                'https://kingshot.net/api/redeem',
                'https://kingshot.net/redeem',
                'https://api.kingshot.net/redeem',
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        body: JSON.stringify({ code, playerId, kingdom }),
                        signal: AbortSignal.timeout(30000)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        return {
                            status: 'success',
                            message: data.message || 'Code redeemed successfully',
                            code
                        };
                    } else if (response.status >= 400 && response.status < 500) {
                        const data = await response.json().catch(() => ({}));
                        return {
                            status: 'failed',
                            message: data.message || 'Code redemption failed',
                            code
                        };
                    }
                } catch (e) {
                    continue;
                }
            }

            return {
                status: 'network_error',
                message: 'Could not connect to redemption service. Please redeem manually at kingshot.net',
                code
            };

        } catch (error) {
            console.error('[KingshotAutoRedeem] API mode error:', error.message);
            return {
                status: 'error',
                message: 'Redemption error: ' + error.message,
                code
            };
        }
    }

    /**
     * Try direct API submission if form not found
     */
    async tryDirectSubmission(page, code, playerId, kingdom) {
        try {
            console.log('[KingshotAutoRedeem] Attempting direct API...');
            
            const result = await page.evaluate(async (code, playerId, kingdom) => {
                try {
                    const response = await fetch('https://kingshot.net/api/redeem', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, playerId, kingdom })
                    });

                    if (response.ok) {
                        return { success: true, data: await response.json() };
                    } else {
                        return { success: false, status: response.status };
                    }
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }, code, playerId, kingdom);

            if (result.success) {
                return {
                    status: 'success',
                    message: 'Code redeemed successfully via API',
                    code
                };
            } else {
                return {
                    status: 'network_error',
                    message: 'Direct API submission failed',
                    code
                };
            }
        } catch (error) {
            return {
                status: 'error',
                message: 'Could not attempt direct submission',
                code
            };
        }
    }

    /**
     * Handle CAPTCHA if present
     */
    async handleCaptcha(page) {
        try {
            const captchaPresent = await page.evaluate(() => {
                return !!document.querySelector('[data-sitekey]') ||
                    !!document.querySelector('.g-recaptcha') ||
                    !!window.grecaptcha;
            });

            if (!captchaPresent) {
                console.log('[KingshotAutoRedeem] No CAPTCHA detected');
                return true;
            }

            console.log('[KingshotAutoRedeem] CAPTCHA detected');

            const isChallengeVisible = await page.evaluate(() => {
                const iframe = document.querySelector('iframe[src*="recaptcha"]');
                return !!iframe && iframe.offsetHeight > 0;
            });

            if (isChallengeVisible) {
                console.log('[KingshotAutoRedeem] CAPTCHA requires manual solving...');
                await page.waitForTimeout(60000);
                return true;
            }

            return true;
        } catch (error) {
            console.error('[KingshotAutoRedeem] CAPTCHA error:', error.message);
            return false;
        }
    }

    /**
     * Check if redemption was successful
     */
    async checkRedemptionResult(page, code) {
        try {
            const result = await page.evaluate(() => {
                const successMessages = ['successfully', 'redeemed', 'congratulations', 'claimed', 'accepted'];
                const errorMessages = ['invalid', 'expired', 'already', 'used', 'error', 'failed'];

                const pageText = document.body.innerText.toLowerCase();
                const hasSuccess = successMessages.some(msg => pageText.includes(msg));
                const hasError = errorMessages.some(msg => pageText.includes(msg));

                const alert = document.querySelector('[role="alert"], .alert, .error, .success');
                const alertText = alert ? alert.innerText : '';

                return { hasSuccess, hasError, alertText };
            });

            if (result.hasSuccess) {
                return {
                    status: 'success',
                    message: result.alertText || 'Code redeemed successfully!',
                    code
                };
            } else if (result.hasError) {
                return {
                    status: 'failed',
                    message: result.alertText || 'Redemption failed (code invalid or already used)',
                    code
                };
            } else {
                return {
                    status: 'pending',
                    message: 'Redemption status unclear - manual verification needed',
                    code
                };
            }
        } catch (error) {
            return {
                status: 'error',
                message: 'Could not determine redemption result',
                code
            };
        }
    }
}

module.exports = KingshotAutoRedeem;
