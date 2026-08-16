/**
 * Kingshot Website Gift Code Source
 * 
 * Scans https://kingshot.net/gift-codes for active codes
 * Uses fetch to get the HTML and extracts codes from the page
 */

const { GiftCodeSource } = require('./giftCodeSource');
const validation = require('../utils/validation');

class KingshotWebsiteSource extends GiftCodeSource {
    constructor() {
        super('Kingshot.net');
        this.url = 'https://kingshot.net/gift-codes';
        this.timeout = 30000; // 30 secondes
    }

    async fetchCodes() {
        const codes = [];
        this.lastError = null;

        try {
            // Fetch la page avec un timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(this.url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                this.lastError = `HTTP ${response.status}: ${response.statusText}`;
                console.log(`[KingshotWebsiteSource] ${this.lastError}`);
                return codes;
            }

            const html = await response.text();

            // Extract all potential gift codes from HTML
            // Look for alphanumeric strings with specific patterns
            // Kingshot codes seem to be primarily:
            // - Hexadecimal-like strings (letters A-F + numbers)
            // - Or alphanumeric 12-20 chars
            
            const hexPattern = /\b[0-9A-F]{12,20}\b/gi; // Hex-like codes
            const alphaNumPattern = /\b[A-Z0-9]{10,20}\b/gi; // Longer alphanumeric
            
            const hexMatches = (html.match(hexPattern) || []).map(m => m.trim().toUpperCase());
            const alphaMatches = (html.match(alphaNumPattern) || []).map(m => m.trim().toUpperCase());
            
            const allMatches = [...hexMatches, ...alphaMatches];
            const candidateCodes = [...new Set(allMatches)];

            // Filter for actual codes:
            // - Must be 10-20 characters
            // - Must have both letters and numbers (or be mostly hex)
            // - Exclude common English words
            const commonWords = ['INFORMATION', 'DESCRIPTION', 'JAVASCRIPT', 'UNDEFINED'];
            
            for (const code of candidateCodes) {
                if (code.length < 10 || code.length > 20) continue;
                if (commonWords.includes(code)) continue;
                
                // Accept if it looks like a gift code
                const hasNumbers = /[0-9]/.test(code);
                const hasLetters = /[A-Z]/.test(code);
                
                if (hasNumbers && hasLetters) {
                    const validation_result = validation.validateGiftCode(code);
                    if (validation_result.valid) {
                        codes.push({
                            code: code,
                            source: 'kingshot-website',
                            sourceUrl: this.url,
                            discoveredAt: Date.now()
                        });
                    }
                }
            }

            // Deduplicate
            const uniqueCodes = [...new Set(codes.map(c => c.code))].map(code => 
                codes.find(c => c.code === code)
            );

            console.log(`[KingshotWebsiteSource] Found ${uniqueCodes.length} valid gift code(s)`);
            return uniqueCodes;

        } catch (err) {
            if (err.name === 'AbortError') {
                this.lastError = 'Request timeout (30s exceeded)';
            } else {
                this.lastError = err.message;
            }
            console.log(`[KingshotWebsiteSource] Error: ${this.lastError}`);
        }

        this.lastFetchTime = new Date();
        return codes;
    }
}

module.exports = KingshotWebsiteSource;
