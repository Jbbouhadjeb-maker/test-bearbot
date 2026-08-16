const storage = require('../utils/storage');

/**
 * Kingshot Redeemer
 * 
 * IMPORTANT: This module does NOT attempt to:
 * - Bypass CAPTCHA
 * - Bypass rate limiting
 * - Circumvent authentication
 * - Use stolen credentials
 * 
 * The redemption site (https://ks-giftcode.centurygame.com) likely has
 * protections against automated redemption. This module provides:
 * 
 * 1. A standard interface for recording redemption attempts
 * 2. Tracking of code usage per account
 * 3. Detection of already-redeemed codes
 * 4. Rate limiting to prevent abuse
 * 
 * Actual redemption automation would require:
 * - An official Kingshot API
 * - Explicit permission from Kingshot
 * - Or manual redemption by the player through the official website
 */

class KingshotRedeemer {
    constructor() {
        this.config = {
            maxRedemptionsPerSecond: 0.2, // One redemption per 5 seconds
            timeout: 30000, // 30 second timeout for HTTP requests
            maxRetries: 2
        };
        this.lastRedemptionTime = 0;
        this.stats = {
            totalAttempts: 0,
            successCount: 0,
            failureCount: 0,
            skippedCount: 0
        };
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
     * Simulate/record a redemption attempt
     * 
     * In a real scenario with an official API, this would make an HTTP request.
     * Currently, this is a placeholder that demonstrates the structure.
     * 
     * Returns: { status, message }
     * Possible statuses:
     * - success
     * - already_redeemed
     * - invalid_code
     * - expired
     * - wrong_kingdom
     * - player_not_found
     * - captcha_required
     * - rate_limited
     * - network_error
     * - unknown_error
     */
    async redeemCode(code, playerId, kingdom) {
        this.stats.totalAttempts++;

        // Rate limiting
        const now = Date.now();
        const elapsed = (now - this.lastRedemptionTime) / 1000;
        const requiredDelay = 1 / this.config.maxRedemptionsPerSecond;
        
        if (elapsed < requiredDelay) {
            const result = {
                status: 'rate_limited',
                message: `Please wait ${Math.ceil(requiredDelay - elapsed)} seconds before the next redemption.`
            };
            this.stats.skippedCount++;
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
            storage.recordRedeemAttempt(code, playerId, kingdom, result);
            return result;
        }

        // TODO: Implement actual redemption here
        // This would require:
        // 1. An official Kingshot API with proper authentication
        // 2. Or a documented redemption endpoint
        // 3. Or acceptance of manual redemption only
        
        // For now, return a message indicating automation is not yet implemented
        const result = {
            status: 'captcha_required',
            message: 'Automatic redemption requires visiting the official Kingshot redemption site. This is a security limitation of the website.'
        };

        this.lastRedemptionTime = now;
        this.stats.failureCount++;
        
        storage.recordRedeemAttempt(code, playerId, kingdom, result);
        return result;
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
            
            // Small delay between redemptions to be respectful
            await new Promise(resolve => setTimeout(resolve, 100));
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
            skippedCount: 0
        };
    }
}

module.exports = KingshotRedeemer;
