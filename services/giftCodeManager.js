const storage = require('../utils/storage');

class GiftCodeManager {
    constructor() {
        this.lastScanTime = null;
        this.scanCount = 0;
        this.codesFound = 0;
        this.lastError = null;
    }

    /**
     * Scan sources for new codes and update storage
     */
    async scanSources(sources) {
        this.lastScanTime = new Date();
        this.lastError = null;
        const newCodes = [];

        if (!sources || !Array.isArray(sources)) {
            return newCodes;
        }

        const existingCodes = storage.loadGiftCodes();

        for (const source of sources) {
            try {
                const codes = await source.fetchCodes();
                
                for (const codeData of codes) {
                    const normalized = codeData.code.trim().toUpperCase();
                    
                    // Check if code is new
                    if (!existingCodes[normalized]) {
                        // Add to storage
                        storage.addOrUpdateGiftCode(normalized, {
                            source: codeData.source,
                            sourceUrl: codeData.sourceUrl
                        });
                        
                        newCodes.push({
                            code: normalized,
                            source: codeData.source,
                            sourceUrl: codeData.sourceUrl
                        });
                        
                        this.codesFound++;
                    } else {
                        // Update last seen time
                        storage.addOrUpdateGiftCode(normalized, {
                            source: codeData.source,
                            sourceUrl: codeData.sourceUrl
                        });
                    }
                }
            } catch (err) {
                this.lastError = `Source ${source.name}: ${err.message}`;
                console.error(`[GiftCodeManager] ${this.lastError}`);
            }
        }

        this.scanCount++;
        return newCodes;
    }

    /**
     * Get all available gift codes
     */
    getAllCodes() {
        return storage.loadGiftCodes();
    }

    /**
     * Get gift code status
     */
    getCodeStatus(code) {
        return storage.getGiftCode(code);
    }

    /**
     * Get codes by status
     */
    getCodesByStatus(status) {
        const allCodes = storage.loadGiftCodes();
        return Object.values(allCodes).filter(c => c.status === status);
    }

    /**
     * Update code status manually
     */
    updateCodeStatus(code, status) {
        return storage.updateGiftCodeStatus(code, status);
    }

    /**
     * Record a redemption attempt
     */
    recordRedemption(code, playerId, kingdom, result) {
        return storage.recordRedeemAttempt(code, playerId, kingdom, result);
    }

    /**
     * Get scan statistics
     */
    getStats() {
        const allCodes = storage.loadGiftCodes();
        const newCodes = Object.values(allCodes).filter(c => c.status === 'new').length;
        const activeCodes = Object.values(allCodes).filter(c => c.status === 'active').length;
        const expiredCodes = Object.values(allCodes).filter(c => c.status === 'expired').length;

        return {
            lastScanTime: this.lastScanTime,
            scanCount: this.scanCount,
            totalCodesFound: this.codesFound,
            totalUniqueCodesInDb: Object.keys(allCodes).length,
            newCodes,
            activeCodes,
            expiredCodes,
            lastError: this.lastError
        };
    }
}

module.exports = GiftCodeManager;
