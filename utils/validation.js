// Validation configuration
const CONFIG = {
    PLAYER_ID_MIN_LENGTH: 1,
    PLAYER_ID_MAX_LENGTH: 20,
    KINGDOM_MIN: 1,
    KINGDOM_MAX: 9999,
    ACCOUNT_NAME_MAX_LENGTH: 50,
    MAX_ACCOUNTS_PER_USER: 20,
    GIFT_CODE_MIN_LENGTH: 3,
    GIFT_CODE_MAX_LENGTH: 20,
    GIFT_CODE_PATTERN: /^[A-Z0-9]+$/i,
    // For auto-detection, use stricter rules (must have letters and numbers)
    AUTO_DETECTED_CODE_MIN_LENGTH: 6,
    AUTO_DETECTED_CODE_MAX_LENGTH: 20
};

function validatePlayerId(playerId) {
    if (typeof playerId !== 'string') {
        return { valid: false, error: 'Player ID must be a string.' };
    }
    
    const trimmed = playerId.trim();
    
    if (trimmed.length === 0) {
        return { valid: false, error: 'Player ID cannot be empty.' };
    }
    
    if (!/^\d+$/.test(trimmed)) {
        return { valid: false, error: 'Player ID must contain only digits.' };
    }
    
    if (trimmed.length > CONFIG.PLAYER_ID_MAX_LENGTH) {
        return { valid: false, error: `Player ID is too long (max ${CONFIG.PLAYER_ID_MAX_LENGTH} characters).` };
    }
    
    return { valid: true, value: trimmed };
}

function validateKingdom(kingdom) {
    let num;
    
    if (typeof kingdom === 'string') {
        num = Number(kingdom.trim());
    } else if (typeof kingdom === 'number') {
        num = kingdom;
    } else {
        return { valid: false, error: 'Kingdom must be a number or string.' };
    }
    
    if (isNaN(num)) {
        return { valid: false, error: 'Kingdom must be a valid number.' };
    }
    
    if (!Number.isInteger(num)) {
        return { valid: false, error: 'Kingdom must be an integer.' };
    }
    
    if (num < CONFIG.KINGDOM_MIN || num > CONFIG.KINGDOM_MAX) {
        return { valid: false, error: `Kingdom must be between ${CONFIG.KINGDOM_MIN} and ${CONFIG.KINGDOM_MAX}.` };
    }
    
    return { valid: true, value: String(num) };
}

function validateAccountName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: true, value: null };
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
        return { valid: true, value: null };
    }
    
    if (trimmed.length > CONFIG.ACCOUNT_NAME_MAX_LENGTH) {
        return { valid: false, error: `Account name is too long (max ${CONFIG.ACCOUNT_NAME_MAX_LENGTH} characters).` };
    }
    
    return { valid: true, value: trimmed };
}

function validateGiftCode(code) {
    if (typeof code !== 'string') {
        return { valid: false, error: 'Gift code must be a string.' };
    }
    
    const trimmed = code.trim().toUpperCase();
    
    if (trimmed.length === 0) {
        return { valid: false, error: 'Gift code cannot be empty.' };
    }
    
    if (trimmed.length < CONFIG.GIFT_CODE_MIN_LENGTH || trimmed.length > CONFIG.GIFT_CODE_MAX_LENGTH) {
        return { valid: false, error: `Gift code must be between ${CONFIG.GIFT_CODE_MIN_LENGTH} and ${CONFIG.GIFT_CODE_MAX_LENGTH} characters.` };
    }
    
    if (!CONFIG.GIFT_CODE_PATTERN.test(trimmed)) {
        return { valid: false, error: 'Gift code must contain only letters and numbers.' };
    }
    
    return { valid: true, value: trimmed };
}

function extractGiftCodesFromText(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }
    
    // Match sequences of alphanumeric characters 6-20 chars
    // We'll manually check for mixed alphanumeric content after
    const pattern = /\b[A-Z0-9]{6,20}\b/gi;
    const matches = text.match(pattern) || [];
    
    // Filter for codes that have BOTH letters and numbers
    const filtered = matches.filter(code => {
        const upper = code.toUpperCase();
        return /[0-9]/.test(upper) && /[A-Z]/.test(upper);
    });
    
    // Normalize and deduplicate
    const codes = [...new Set(filtered.map(m => m.trim().toUpperCase()))];
    
    // Filter only those that pass validation
    return codes.filter(code => validateGiftCode(code).valid);
}

module.exports = {
    CONFIG,
    validatePlayerId,
    validateKingdom,
    validateAccountName,
    validateGiftCode,
    extractGiftCodesFromText
};
