const storage = require('../utils/storage');
const KingshotAutoRedeem = require('./kingshot-auto-redeem');

/**
 * Kingshot Gift Code Redeemer
 * Handles automatic gift code redemption using Puppeteer
 * Simulates real user interactions to bypass CAPTCHA
 */
class KingshotRedeemer {
    constructor() {
        this.autoRedeem = new KingshotAutoRedeem();
        this.config = {
            maxRedemptionsPerSecond: 0.5, // One redemption per 2 seconds
            timeout: 30000, // 30 second timeout for HTTP requests
            maxRetries: 1
        };
        this.lastRedemptionTime = 0;
        this.stats = {
            totalAttempts: 0,
            successCount: 0,
            failureCount: 0,
            skippedCount: 0,
            captchaCount: 0
        };
    }

    /**
     * Initialize auto-redeemer
     */
    async initialize() {
        try {
            await this.autoRedeem.initialize();
            console.log('[KingshotRedeemer] Auto-redeem initialized');
        } catch (error) {
            console.error('[KingshotRedeemer] Failed to initialize:', error.message);
        }
    }

    /**
     * Shutdown auto-redeemer
     */
    async shutdown() {
        try {
            await this.autoRedeem.shutdown();
            console.log('[KingshotRedeemer] Auto-redeem shutdown');
        } catch (error) {
            console.error('[KingshotRedeemer] Error during shutdown:', error.message);
        }
    }

    /**
     * Check if a code has already been redeemed for a specific account
     */
    hasBeenRedeemed(code, playerId, kingdom) {
        const codeData = storage.getGiftCode(code);
        if (!codeData) {
            return false;
        }

        const key = `${playerId}_${kingdom}`;
        const result = codeData.redeemResults[key];
        
        return result && (
            result.status === 'success' ||
            result.status === 'already_redeemed'
        );
    }

    /**
     * Get the history of a code for a specific account
     */
    getRedemptionHistory(code, playerId, kingdom) {
        const codeData = storage.getGiftCode(code);
        if (!codeData) {
            return null;
        }

        const key = `${playerId}_${kingdom}`;
        return codeData.redeemResults[key] || null;
    }

    /**
     * Redeem a gift code using Puppeteer automation
     * @param {string} code - Gift code to redeem
     * @param {string} playerId - Player ID
     * @param {string} kingdom - Kingdom ID
     * @returns {Promise<{status: string, message: string}>}
     */
    async redeemCode(code, playerId, kingdom) {
        this.stats.totalAttempts++;

        // Rate limiting
        const now = Date.now();
        const elapsed = (now - this.lastRedemptionTime) / 1000;
        const requiredDelay = 1 / this.config.maxRedemptionsPerSecond;
        
        if (elapsed < requiredDelay) {
            const waitTime = Math.ceil(requiredDelay - elapsed);
            const result = {
                status: 'rate_limited',
                message: `Rate limited. Please wait ${waitTime}s before next redemption.`
            };
            this.stats.skippedCount++;
            storage.recordRedeemAttempt(code, playerId, kingdom, result);
            return result;
        }

        // Check if already redeemed for this account
        if (this.hasBeenRedeemed(code, playerId, kingdom)) {
            const history = this.getRedemptionHistory(code, playerId, kingdom);
            const result = {
                status: history.status,
                message: history.message || 'This code has already been used on this account.'
            };
            this.stats.skippedCount++;
            return result;
        }

        try {
            console.log(`[KingshotRedeemer] Attempting to redeem ${code} for player ${playerId}`);
            
            // Use Puppeteer to redeem automatically
            const result = await this.autoRedeem.redeemCode(code, playerId, kingdom);
            
            // Update stats based on result
            if (result.status === 'success') {
                this.stats.successCount++;
            } else if (result.status === 'captcha_unsolvable' || result.status === 'captcha_required') {
                this.stats.captchaCount++;
            } else if (result.status === 'error' || result.status === 'network_error') {
                this.stats.failureCount++;
            } else {
                this.stats.failureCount++;
            }

            this.lastRedemptionTime = now;
            
            // Record the attempt in storage
            storage.recordRedeemAttempt(code, playerId, kingdom, result);
            
            return result;

        } catch (error) {
            console.error(`[KingshotRedeemer] Error redeeming ${code}:`, error.message);
            
            const result = {
                status: 'error',
                message: `Redemption error: ${error.message}`
            };
            
            this.stats.failureCount++;
            this.lastRedemptionTime = now;
            
            storage.recordRedeemAttempt(code, playerId, kingdom, result);
            
            return result;
        }
    }

    /**
     * Batch redeem a code across multiple accounts
     */
    async redeemCodeMultiple(code, accounts) {
        const results = [];
        
        for (const account of accounts) {
            const result = await this.redeemCode(code, account.playerId, account.kingdom);
            results.push({
                account,
                result
            });
            
            // Delay between redemptions
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        return results;
    }

    /**
     * Get redemption statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics (useful for testing)
     */
    resetStats() {
        this.stats = {
            totalAttempts: 0,
            successCount: 0,
            failureCount: 0,
            skippedCount: 0,
            captchaCount: 0
        };
    }
}

module.exports = KingshotRedeemer;
