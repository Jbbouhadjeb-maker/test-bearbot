const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DATA_DIR = './data';
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const GIFTCODES_FILE = path.join(DATA_DIR, 'giftcodes.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function writeJsonAtomic(filePath, data) {
    ensureDataDir();
    const tmpFile = filePath + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, filePath);
}

// ===== PLAYERS =====
function loadPlayers() {
    ensureDataDir();
    if (!fs.existsSync(PLAYERS_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
    } catch (err) {
        console.error('[Storage] Error reading players.json:', err);
        return {};
    }
}

function savePlayers(players) {
    try {
        writeJsonAtomic(PLAYERS_FILE, players);
    } catch (err) {
        console.error('[Storage] Error saving players.json:', err);
        throw err;
    }
}

function getUserAccounts(discordUserId) {
    const players = loadPlayers();
    if (!players[discordUserId]) {
        return [];
    }
    return players[discordUserId].accounts || [];
}

function addAccount(discordUserId, playerId, kingdom, name = null) {
    const players = loadPlayers();
    
    if (!players[discordUserId]) {
        players[discordUserId] = { accounts: [] };
    }

    const account = {
        id: randomUUID(),
        name: name || `Account ${players[discordUserId].accounts.length + 1}`,
        playerId,
        kingdom,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    players[discordUserId].accounts.push(account);
    savePlayers(players);
    return account;
}

function updateAccount(discordUserId, accountId, updates) {
    const players = loadPlayers();
    if (!players[discordUserId]) {
        return null;
    }

    const account = players[discordUserId].accounts.find(a => a.id === accountId);
    if (!account) {
        return null;
    }

    Object.assign(account, updates, { updatedAt: new Date().toISOString() });
    savePlayers(players);
    return account;
}

function removeAccount(discordUserId, accountId) {
    const players = loadPlayers();
    if (!players[discordUserId]) {
        return false;
    }

    const beforeLen = players[discordUserId].accounts.length;
    players[discordUserId].accounts = players[discordUserId].accounts.filter(a => a.id !== accountId);
    
    if (players[discordUserId].accounts.length < beforeLen) {
        savePlayers(players);
        return true;
    }
    return false;
}

function findAccount(discordUserId, accountId) {
    const players = loadPlayers();
    if (!players[discordUserId]) {
        return null;
    }
    return players[discordUserId].accounts.find(a => a.id === accountId);
}

function findAccountByPlayerId(playerId) {
    const players = loadPlayers();
    for (const [discordId, userData] of Object.entries(players)) {
        const acc = userData.accounts?.find(a => a.playerId === playerId);
        if (acc) {
            return { discordUserId: discordId, account: acc };
        }
    }
    return null;
}

// ===== GIFT CODES =====
function loadGiftCodes() {
    ensureDataDir();
    if (!fs.existsSync(GIFTCODES_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(GIFTCODES_FILE, 'utf8'));
    } catch (err) {
        console.error('[Storage] Error reading giftcodes.json:', err);
        return {};
    }
}

function saveGiftCodes(codes) {
    try {
        writeJsonAtomic(GIFTCODES_FILE, codes);
    } catch (err) {
        console.error('[Storage] Error saving giftcodes.json:', err);
        throw err;
    }
}

function addOrUpdateGiftCode(code, metadata) {
    const codes = loadGiftCodes();
    const normalized = code.trim().toUpperCase();
    
    if (!codes[normalized]) {
        codes[normalized] = {
            code: normalized,
            firstSeenAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            source: metadata.source || 'unknown',
            sourceUrl: metadata.sourceUrl || null,
            status: 'new',
            redeemResults: {}
        };
    } else {
        codes[normalized].lastSeenAt = new Date().toISOString();
    }

    saveGiftCodes(codes);
    return codes[normalized];
}

function getGiftCode(code) {
    const codes = loadGiftCodes();
    return codes[code.trim().toUpperCase()] || null;
}

function updateGiftCodeStatus(code, newStatus) {
    const codes = loadGiftCodes();
    const normalized = code.trim().toUpperCase();
    
    if (codes[normalized]) {
        codes[normalized].status = newStatus;
        saveGiftCodes(codes);
        return codes[normalized];
    }
    return null;
}

function recordRedeemAttempt(code, playerId, kingdom, result) {
    const codes = loadGiftCodes();
    const normalized = code.trim().toUpperCase();
    
    if (!codes[normalized]) {
        return null;
    }

    const key = `${playerId}_${kingdom}`;
    codes[normalized].redeemResults[key] = {
        playerId,
        kingdom,
        status: result.status,
        message: result.message || '',
        timestamp: new Date().toISOString()
    };

    saveGiftCodes(codes);
    return codes[normalized];
}

module.exports = {
    ensureDataDir,
    loadPlayers,
    savePlayers,
    getUserAccounts,
    addAccount,
    updateAccount,
    removeAccount,
    findAccount,
    findAccountByPlayerId,
    loadGiftCodes,
    saveGiftCodes,
    addOrUpdateGiftCode,
    getGiftCode,
    updateGiftCodeStatus,
    recordRedeemAttempt
};
