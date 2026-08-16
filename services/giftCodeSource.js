// Base class for gift code sources
class GiftCodeSource {
    constructor(name) {
        this.name = name;
        this.lastFetchTime = null;
        this.lastError = null;
    }

    async fetchCodes() {
        throw new Error('fetchCodes() must be implemented by subclass');
    }

    async initialize() {
        // Optional initialization
    }

    async shutdown() {
        // Optional cleanup
    }
}

// Discord-based gift code source
// Scans configured Discord channels for gift codes
class DiscordGiftCodeSource extends GiftCodeSource {
    constructor(client, config = {}) {
        super('Discord');
        this.client = client;
        this.config = config;
        this.channels = config.channels || [];
    }

    setChannels(channels) {
        this.channels = channels || [];
    }

    async fetchCodes() {
        const codes = [];
        this.lastError = null;

        if (!this.channels || this.channels.length === 0) {
            return codes;
        }

        const { extractGiftCodesFromText } = require('../utils/validation');

        for (const channelConfig of this.channels) {
            try {
                const channel = await this.client.channels.fetch(channelConfig.channelId);
                if (!channel || !channel.isTextBased()) {
                    console.log(`[GiftCodeSource] Channel ${channelConfig.channelId} not found or not text-based`);
                    continue;
                }

                // Fetch the last 50 messages (configurable)
                const messages = await channel.messages.fetch({ limit: 50 });

                for (const msg of messages.values()) {
                    const foundCodes = extractGiftCodesFromText(msg.content);
                    for (const code of foundCodes) {
                        if (!codes.some(c => c.code === code)) {
                            codes.push({
                                code,
                                source: 'discord',
                                sourceUrl: msg.url,
                                discoveredAt: msg.createdTimestamp,
                                messageAuthor: msg.author.tag
                            });
                        }
                    }
                }
            } catch (err) {
                const msg = `Error scanning channel ${channelConfig.channelId}: ${err.message}`;
                console.error(`[GiftCodeSource] ${msg}`);
                this.lastError = msg;
            }
        }

        this.lastFetchTime = new Date();
        return codes;
    }
}

module.exports = {
    GiftCodeSource,
    DiscordGiftCodeSource
};
