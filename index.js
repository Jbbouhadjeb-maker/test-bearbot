require('dotenv').config();

const {
    Client,
    Events,
    GatewayIntentBits,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

const fs = require('fs');
const { randomUUID } = require('crypto');
const schedule = require('node-schedule');

// ===== LOGGING =====
// Timestamped console logger so activity can be traced from the terminal.
function log(...args) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CONFIG_FILE = './config.json';

// ===== CONFIG =====
// Default to UTC; overridable per guild in config.json (any IANA timezone).
const DEFAULT_TZ = "UTC";

// Guild-wide settings are shared; each guild owns a list of custom events.
const DEFAULT_CONFIG = {
    startDate: null,      // anchor used by interval-type events
    channelId: null,
    mentionRole: null,
    timezone: DEFAULT_TZ,
    events: []
};

const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MAX_EVENTS = 25; // Discord select menus allow at most 25 options.

// Curated emoji set offered in the picker.
const PRESET_EMOJIS = ['🐻', '⚔️', '🛡️', '🏰', '🐉', '🔥', '💎', '⭐', '🎯', '🏆', '⏰', '📅', '🎁', '💰', '🗡️', '🏹', '🛠️', '👑', '🚩', '🔔', '📢', '⚡', '🌟', '🎮'];

const TYPE_OPTIONS = [
    { value: 'daily', label: 'Daily', emoji: '📆', description: 'Every day at a set time' },
    { value: 'interval', label: 'Interval cycle', emoji: '🔁', description: 'Every N hours from start date' },
    { value: 'weekly', label: 'Weekly', emoji: '🗓️', description: 'On chosen weekday(s)' },
    { value: 'once', label: 'One-time', emoji: '1️⃣', description: 'Fires once, then auto-removes' }
];
const TYPE_LABEL = { daily: 'Daily', interval: 'Interval', weekly: 'Weekly', once: 'One-time' };

const LEAD_OPTIONS = [0, 5, 10, 15, 20, 30];
const INTERVAL_OPTIONS = [6, 12, 24, 36, 48, 72];

const DAY_OPTIONS = [
    { value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' }
];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ===== EVENT MODEL =====
function newEvent(props = {}) {
    return {
        id: randomUUID(),
        name: 'New Event',
        emoji: '📌',
        type: 'daily',
        time: '12:00',
        lead: 10,
        intervalHours: 48,
        days: [],
        date: null,
        message: null, // optional custom text; falls back to the default reminder when blank
        enabled: true,
        ...props
    };
}

function findEvent(config, id) {
    return (config.events || []).find(e => e.id === id);
}

// ===== TIMEZONE HELPERS =====
// Offset (ms) between the given IANA timezone and UTC at a specific instant.
function tzOffsetMs(date, tz) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const p = dtf.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour === '24' ? 0 : p.hour, p.minute, p.second);
    return asUTC - date.getTime();
}

// Build the UTC instant for a wall-clock time (y,mo,d,h,mi) in the given timezone.
function zonedTimeToUtc(y, mo, d, h, mi, tz) {
    const utcGuess = Date.UTC(y, mo, d, h, mi, 0);
    const offset = tzOffsetMs(new Date(utcGuess), tz);
    return new Date(utcGuess - offset);
}

// Calendar (y/mo/d) of an instant as seen in the given timezone.
function dateParts(dateLike, tz) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(dateLike))
        .reduce((a, x) => (a[x.type] = Number(x.value), a), {});
}

// Resolve the interval anchor day (UTC y/mo/d) from config.startDate.
// New format is a plain "YYYY-MM-DD" date; legacy ISO instants fall back to their UTC day.
function startDateParts(startDate) {
    if (!startDate) return null;
    if (DATE_REGEX.test(startDate)) {
        const [year, month, day] = startDate.split('-').map(Number);
        return { year, month, day };
    }
    return dateParts(startDate, 'UTC');
}

// Wall-clock (hour,minute) shifted back by `lead` minutes, wrapped into a single day.
function subtractLead(hour, minute, lead) {
    let total = ((hour * 60 + minute - lead) % 1440 + 1440) % 1440;
    return { hour: Math.floor(total / 60), minute: total % 60 };
}

// ===== LOAD / SAVE =====
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveConfig(allConfig) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(allConfig, null, 2));
}

// Persist a single guild's config by re-reading the file first, so concurrent
// changes to other guilds are not clobbered (read-merge-write is atomic here:
// no awaits between read and write, and writeFileSync is blocking).
function saveGuildConfig(guildId, guildConfig) {
    const fresh = loadConfig();
    fresh[guildId] = guildConfig;
    saveConfig(fresh);
}

// Convert an old-shape config (bear1/bear2/arena) into the unified events list.
// Idempotent: skips configs that already have an events array.
function migrateGuildConfig(cfg) {
    if (Array.isArray(cfg.events)) return cfg;

    const events = [];
    if (cfg.bear1) events.push(newEvent({ name: 'Bear Trap 1', emoji: '🐻', type: 'interval', time: cfg.bear1, intervalHours: 48, lead: 10 }));
    if (cfg.bear2) events.push(newEvent({ name: 'Bear Trap 2', emoji: '🐻', type: 'interval', time: cfg.bear2, intervalHours: 48, lead: 10 }));
    if (cfg.arena) events.push(newEvent({ name: 'Arena', emoji: '⚔️', type: 'daily', time: '23:50', lead: 0 }));

    cfg.events = events;
    delete cfg.bear1;
    delete cfg.bear2;
    delete cfg.arena;
    return cfg;
}

function getGuildConfig(allConfig, guildId) {
    if (!allConfig[guildId] || typeof allConfig[guildId] !== "object") {
        allConfig[guildId] = { ...DEFAULT_CONFIG, events: [] };
    }
    return migrateGuildConfig(allConfig[guildId]);
}

// ===== JOBS =====
let jobs = {};

// Tracks the live /config panel message per guild so it can be refreshed in place
// after edits made through ephemeral follow-ups.
let panels = {};

async function refreshPanel(guildId, config) {
    const msg = panels[guildId];
    if (!msg) return;
    try {
        await msg.edit(getPanel(config));
    } catch {
        delete panels[guildId]; // message gone/expired
    }
}

function clearJobs(guildId) {
    if (!jobs[guildId]) return;
    jobs[guildId].forEach(j => j.job.cancel());
    jobs[guildId] = [];
}

function getMention(config) {
    return config.mentionRole ? `<@&${config.mentionRole}>` : "@everyone";
}

function buildMessage(ev) {
    // Custom messages get the event title above the text, but no countdown — a
    // custom message may just be a general reminder, not an event timing notice.
    if (ev.message && ev.message.trim()) return `${ev.emoji} **${ev.name}**\n${ev.message.trim()}`;
    const lead = Number(ev.lead) || 0;
    const when = lead > 0 ? `in ${lead} minutes` : 'NOW';
    return `${ev.emoji} **${ev.name} ${when}** ⏰`;
}

function scheduleJobs(guildId, config) {
    if (!config || typeof config !== "object") return;

    clearJobs(guildId);
    jobs[guildId] = [];

    if (!config.channelId) {
        log(`⏸️  [${guildId}] not scheduling — no channel set`);
        return;
    }

    const tz = config.timezone || DEFAULT_TZ;

    const send = (msg) => {
        client.channels.fetch(config.channelId)
            .then(c => {
                log(`📤 [${guildId}] sending to #${c.name || config.channelId}: ${msg}`);
                return c.send(`${getMention(config)} ${msg}`);
            })
            .catch(err => log(`❌ [${guildId}] failed to send message:`, err));
    };

    for (const ev of (config.events || [])) {
        if (ev.enabled === false) continue;
        if (!TIME_REGEX.test(ev.time)) {
            log(`⚠️  [${guildId}] skipping "${ev.name}" — invalid time ${ev.time}`);
            continue;
        }

        const [hour, minute] = ev.time.split(':').map(Number);
        const lead = Number(ev.lead) || 0;

        if (ev.type === 'daily') {
            const rm = subtractLead(hour, minute, lead);
            const rule = new schedule.RecurrenceRule();
            rule.hour = rm.hour;
            rule.minute = rm.minute;
            rule.tz = tz;

            const job = schedule.scheduleJob(rule, () => {
                log(`🔔 [${guildId}] "${ev.name}" (daily) firing`);
                send(buildMessage(ev));
            });
            if (job) {
                jobs[guildId].push({ ev, job });
                log(`📅 [${guildId}] scheduled "${ev.name}" daily ${ev.time} (reminder ${rm.hour}:${String(rm.minute).padStart(2, '0')} ${tz})`);
            }

        } else if (ev.type === 'weekly') {
            if (!ev.days || !ev.days.length) {
                log(`⚠️  [${guildId}] skipping "${ev.name}" — weekly with no days`);
                continue;
            }
            // Note: a large lead crossing midnight keeps the reminder on the selected
            // weekday rather than rolling to the previous day (acceptable for small leads).
            const rm = subtractLead(hour, minute, lead);
            const rule = new schedule.RecurrenceRule();
            rule.dayOfWeek = ev.days.map(Number);
            rule.hour = rm.hour;
            rule.minute = rm.minute;
            rule.tz = tz;

            const job = schedule.scheduleJob(rule, () => {
                log(`🔔 [${guildId}] "${ev.name}" (weekly) firing`);
                send(buildMessage(ev));
            });
            if (job) {
                jobs[guildId].push({ ev, job });
                log(`📅 [${guildId}] scheduled "${ev.name}" weekly ${ev.days.map(d => DAY_SHORT[d]).join('/')} ${ev.time} ${tz}`);
            }

        } else if (ev.type === 'interval') {
            if (!config.startDate) {
                log(`⚠️  [${guildId}] skipping "${ev.name}" — interval needs a start date`);
                continue;
            }
            const intervalHours = Number(ev.intervalHours) || 48;
            const stepMs = intervalHours * 60 * 60 * 1000;
            const sp = startDateParts(config.startDate);

            let next = zonedTimeToUtc(sp.year, sp.month - 1, sp.day, hour, minute, tz);
            next = new Date(next.getTime() - lead * 60000); // reminder fires `lead` before
            while (next <= new Date()) {
                next = new Date(next.getTime() + stepMs);
            }

            const job = schedule.scheduleJob(next, function () {
                log(`🔔 [${guildId}] "${ev.name}" (interval) firing`);
                send(buildMessage(ev));
                job.reschedule(new Date(Date.now() + stepMs));
            });
            if (job) {
                jobs[guildId].push({ ev, job });
                log(`📅 [${guildId}] scheduled "${ev.name}" every ${intervalHours}h @ ${ev.time} ${tz} — next: ${next.toISOString()}`);
            }

        } else if (ev.type === 'once') {
            if (!ev.date || !DATE_REGEX.test(ev.date)) {
                log(`⚠️  [${guildId}] skipping "${ev.name}" — one-time needs a valid date`);
                continue;
            }
            const [y, mo, d] = ev.date.split('-').map(Number);
            let fire = zonedTimeToUtc(y, mo - 1, d, hour, minute, tz);
            fire = new Date(fire.getTime() - lead * 60000);
            if (fire <= new Date()) {
                log(`⚠️  [${guildId}] skipping "${ev.name}" — one-time is in the past`);
                continue;
            }

            const job = schedule.scheduleJob(fire, () => {
                log(`🔔 [${guildId}] "${ev.name}" (one-time) firing`);
                send(buildMessage(ev));
                // Auto-remove the event after it fires.
                const fresh = loadConfig();
                const gc = getGuildConfig(fresh, guildId);
                gc.events = (gc.events || []).filter(e => e.id !== ev.id);
                saveConfig(fresh);
                scheduleJobs(guildId, gc);
                refreshPanel(guildId, gc);
            });
            if (job) {
                jobs[guildId].push({ ev, job });
                log(`📅 [${guildId}] scheduled "${ev.name}" once ${ev.date} ${ev.time} ${tz} — fires: ${fire.toISOString()}`);
            }
        }
    }

    log(`✅ [${guildId}] scheduled ${jobs[guildId].length} job(s)`);
}

// ===== PANEL =====
function formatEventLine(ev) {
    const lead = Number(ev.lead) || 0;
    const leadStr = lead > 0 ? `${lead}m before` : 'on time';
    let sched;
    if (ev.type === 'daily') sched = `daily ${ev.time}`;
    else if (ev.type === 'interval') sched = `every ${ev.intervalHours || 48}h @ ${ev.time}`;
    else if (ev.type === 'weekly') sched = `${(ev.days || []).map(d => DAY_SHORT[d]).join('/') || 'no days'} ${ev.time}`;
    else sched = `once ${ev.date || 'no date'} ${ev.time}`;
    const off = ev.enabled === false ? ' _(disabled)_' : '';
    const custom = ev.message ? ' 💬' : '';
    return `${ev.emoji} **${ev.name}** — ${sched}, ${leadStr}${off}${custom}`;
}

function getPanel(config) {
    const events = config.events || [];
    const list = events.length
        ? events.map(formatEventLine).join('\n')
        : '_No events yet. Click **➕ Add Event** to create one._';

    const embed = new EmbedBuilder()
        .setTitle("⚙️ Bot Configuration Panel")
        .setColor(0x5865F2)
        .setDescription(`**Events (${events.length}/${MAX_EVENTS})**\n${list}`)
        .addFields(
            { name: "📢 Channel", value: config.channelId ? `<#${config.channelId}>` : "Not set", inline: true },
            { name: "🏷️ Role", value: config.mentionRole ? `<@&${config.mentionRole}>` : "@everyone", inline: true },
            { name: "🌐 Timezone", value: config.timezone || DEFAULT_TZ, inline: true },
            {
                name: "📅 Start Date (interval anchor)",
                value: config.startDate ? `${String(config.startDate).slice(0, 10)} (UTC)` : "Not set"
            }
        );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('evt_add').setLabel('Add Event').setEmoji('➕').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('evt_edit').setLabel('Edit Event').setEmoji('✏️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('evt_remove').setLabel('Remove Event').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('set_channel').setLabel('Channel').setEmoji('📢').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('set_role').setLabel('Role').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('set_start').setLabel('Start Date').setEmoji('📅').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

// Ephemeral per-event editor (select menus + buttons). discord.js modals can only
// hold text inputs, so all the choices live here as follow-up select menus.
function getEventEditPanel(ev) {
    const rows = [];

    rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`evt:${ev.id}:type`)
            .setPlaceholder(`Type: ${TYPE_LABEL[ev.type]}`)
            .addOptions(TYPE_OPTIONS.map(o => ({
                label: o.label, value: o.value, description: o.description, emoji: o.emoji, default: o.value === ev.type
            })))
    ));

    rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`evt:${ev.id}:emoji`)
            .setPlaceholder(`Emoji: ${ev.emoji}`)
            .addOptions(PRESET_EMOJIS.map(e => ({ label: e, value: e, default: e === ev.emoji })))
    ));

    rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`evt:${ev.id}:lead`)
            .setPlaceholder(`Lead: ${Number(ev.lead) > 0 ? ev.lead + ' min before' : 'on time'}`)
            .addOptions(LEAD_OPTIONS.map(n => ({
                label: n > 0 ? `${n} minutes before` : 'On time (0 min)', value: String(n), default: Number(ev.lead) === n
            })))
    ));

    if (ev.type === 'weekly') {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`evt:${ev.id}:days`)
                .setPlaceholder('Pick weekday(s)')
                .setMinValues(1).setMaxValues(7)
                .addOptions(DAY_OPTIONS.map(day => ({
                    label: day.label, value: day.value, default: (ev.days || []).map(String).includes(day.value)
                })))
        ));
    } else if (ev.type === 'interval') {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`evt:${ev.id}:interval`)
                .setPlaceholder(`Interval: every ${ev.intervalHours || 48}h`)
                .addOptions(INTERVAL_OPTIONS.map(h => ({
                    label: `Every ${h} hours`, value: String(h), default: Number(ev.intervalHours) === h
                })))
        ));
    }

    const btns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`evt:${ev.id}:nametime`).setLabel('Name / Time').setEmoji('✏️').setStyle(ButtonStyle.Secondary)
    );
    if (ev.type === 'once') {
        btns.addComponents(
            new ButtonBuilder().setCustomId(`evt:${ev.id}:setdate`).setLabel('Set Date').setEmoji('📅').setStyle(ButtonStyle.Secondary)
        );
    }
    btns.addComponents(
        new ButtonBuilder().setCustomId(`evt:${ev.id}:toggle`).setLabel(ev.enabled === false ? 'Enable' : 'Disable').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`evt:${ev.id}:delete`).setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`evt:${ev.id}:done`).setLabel('Done').setEmoji('✅').setStyle(ButtonStyle.Primary)
    );
    rows.push(btns);

    const customLine = ev.message ? `\n💬 Custom: ${ev.message}` : '';
    return {
        content: `Editing **${ev.emoji} ${ev.name}**\n${formatEventLine(ev)}${customLine}`,
        components: rows,
        flags: MessageFlags.Ephemeral
    };
}

// Ephemeral select listing events (used by Edit / Remove).
function getEventChooser(config, action) {
    const verb = action === 'remove' ? '🗑️ Remove' : '✏️ Edit';
    return {
        content: `${verb} which event?`,
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(action === 'remove' ? 'evt_remove_select' : 'evt_edit_select')
                    .setPlaceholder('Select an event')
                    .addOptions(config.events.map(ev => ({
                        label: ev.name.slice(0, 100),
                        value: ev.id,
                        description: formatEventLine(ev).replace(/\*\*|_/g, '').slice(0, 100),
                        emoji: ev.emoji
                    })))
            )
        ],
        flags: MessageFlags.Ephemeral
    };
}

// Modal for creating/editing an event's name, time, and optional custom message.
function nameTimeModal(customId, ev) {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(ev ? 'Edit Details' : 'New Event');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Event name').setStyle(TextInputStyle.Short)
                .setRequired(true).setMaxLength(100).setValue(ev ? ev.name : '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('time').setLabel('Event time (24h HH:MM)').setStyle(TextInputStyle.Short)
                .setRequired(true).setPlaceholder('16:50').setValue(ev ? ev.time : '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('message').setLabel('Custom message (optional)').setStyle(TextInputStyle.Paragraph)
                .setRequired(false).setMaxLength(1000).setPlaceholder('Leave blank for the default reminder')
                .setValue(ev && ev.message ? ev.message : '')
        )
    );
    return modal;
}

// Next reminder instant strictly after `after`, or null if the event would not fire.
// IMPORTANT: keep these rules in sync with scheduleJobs() — this expresses the same
// schedule as explicit instants (instead of node-schedule rules) so /today can list fires.
function nextFireAfter(ev, config, after) {
    if (ev.enabled === false) return null;
    if (!TIME_REGEX.test(ev.time)) return null;

    const tz = config.timezone || DEFAULT_TZ;
    const [hour, minute] = ev.time.split(':').map(Number);
    const lead = Number(ev.lead) || 0;

    if (ev.type === 'once') {
        if (!ev.date || !DATE_REGEX.test(ev.date)) return null;
        const [y, mo, d] = ev.date.split('-').map(Number);
        const fire = new Date(zonedTimeToUtc(y, mo - 1, d, hour, minute, tz).getTime() - lead * 60000);
        return fire > after ? fire : null;
    }

    if (ev.type === 'interval') {
        if (!config.startDate) return null;
        const sp = startDateParts(config.startDate);
        const step = (Number(ev.intervalHours) || 48) * 60 * 60 * 1000;
        let next = new Date(zonedTimeToUtc(sp.year, sp.month - 1, sp.day, hour, minute, tz).getTime() - lead * 60000);
        while (next <= after) next = new Date(next.getTime() + step);
        return next;
    }

    // daily / weekly: fire at the reminder time-of-day on qualifying UTC days.
    const rm = subtractLead(hour, minute, lead);
    const sp = dateParts(after, tz);
    for (let i = 0; i < 8; i++) {
        const instant = zonedTimeToUtc(sp.year, sp.month - 1, sp.day + i, rm.hour, rm.minute, tz);
        if (instant <= after) continue;
        if (ev.type === 'weekly') {
            if (!ev.days || !ev.days.length) return null;
            if (!ev.days.map(Number).includes(instant.getUTCDay())) continue;
        }
        return instant;
    }
    return null;
}

// All reminder instants for an event within [from, to).
function firesInRange(ev, config, from, to) {
    const res = [];
    let cursor = new Date(from.getTime() - 1); // include a fire landing exactly at `from`
    for (let i = 0; i < 60; i++) {
        const next = nextFireAfter(ev, config, cursor);
        if (!next || next >= to) break;
        res.push(next);
        cursor = next;
    }
    return res;
}

// Builds an embed listing reminders firing today (remaining) and tomorrow (UTC).
function getTodayList(guildId) {
    const config = getGuildConfig(loadConfig(), guildId);
    const now = new Date();
    const startOfTomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const startOfDayAfter = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));

    // scheduleJobs schedules nothing without a channel, so list nothing then either.
    const events = config.channelId ? (config.events || []) : [];

    const collect = (from, to) =>
        events.flatMap(ev => firesInRange(ev, config, from, to).map(at => ({ ev, at })))
            .sort((a, b) => a.at - b.at);

    // Render the clock time explicitly in UTC. Discord's <t:...:t> token would
    // localize to each viewer's timezone, contradicting the "(UTC)" labelling;
    // the relative (<t:...:R>) token stays since it is timezone-independent.
    const utcTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const fmt = (list) => list.map(({ ev, at }) => {
        const unix = Math.floor(at.getTime() / 1000);
        return `${ev.emoji} **${ev.name}** — ${utcTime.format(at)} UTC (<t:${unix}:R>)`;
    }).join('\n');

    const today = collect(now, startOfTomorrow);
    const tomorrow = collect(startOfTomorrow, startOfDayAfter);

    const embed = new EmbedBuilder()
        .setTitle("📋 Upcoming reminders")
        .setColor(0x5865F2)
        .addFields(
            { name: "📅 Today (remaining)", value: today.length ? fmt(today) : "🎉 Nothing left today." },
            { name: "🌅 Tomorrow", value: tomorrow.length ? fmt(tomorrow) : "— Nothing scheduled." }
        );

    if (!config.channelId) {
        embed.setDescription("⚠️ No announcement channel set — reminders won't send until you set one in `/config`.");
    }

    return { embeds: [embed] };
}

// ===== INTERACTIONS =====
client.on('interactionCreate', async interaction => {
    if (!interaction.guildId) return;

    const who = interaction.user?.tag || 'unknown';
    const what = interaction.customId || interaction.commandName || interaction.type;
    log(`🎛️  [${interaction.guildId}] interaction "${what}" by ${who}`);

    // /today is read-only and open to everyone — handle it before the permission gate.
    if (interaction.isChatInputCommand() && interaction.commandName === 'today') {
        return interaction.reply(getTodayList(interaction.guildId));
    }

    // Permission gate: only members with Manage Server (or admins) may configure.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        if (interaction.isRepliable()) {
            return interaction.reply({
                content: '❌ You need the **Manage Server** permission to configure events.',
                flags: MessageFlags.Ephemeral
            });
        }
        return;
    }

    const allConfig = loadConfig();
    const config = getGuildConfig(allConfig, interaction.guildId);
    const gid = interaction.guildId;

    // Save + reschedule + refresh the main panel after a change.
    const persist = async () => {
        saveGuildConfig(gid, config);
        scheduleJobs(gid, config);
        await refreshPanel(gid, config);
    };

    try {

        // ----- Slash command: open the panel -----
        if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
            await interaction.reply(getPanel(config));
            panels[gid] = await interaction.fetchReply();
            return;
        }

        // ----- Buttons -----
        if (interaction.isButton()) {
            const id = interaction.customId;

            if (id === 'evt_add') {
                if (config.events.length >= MAX_EVENTS) {
                    return interaction.reply({ content: `❌ Limit reached (${MAX_EVENTS} events).`, flags: MessageFlags.Ephemeral });
                }
                return interaction.showModal(nameTimeModal('evt_addmodal'));
            }

            if (id === 'evt_edit' || id === 'evt_remove') {
                if (!config.events.length) {
                    return interaction.reply({ content: 'No events yet. Use **➕ Add Event** first.', flags: MessageFlags.Ephemeral });
                }
                return interaction.reply(getEventChooser(config, id === 'evt_remove' ? 'remove' : 'edit'));
            }

            // Per-event buttons: evt:<id>:<action>
            if (id.startsWith('evt:')) {
                const [, evId, action] = id.split(':');
                const ev = findEvent(config, evId);
                if (!ev) {
                    return interaction.update({ content: '⚠️ That event no longer exists.', components: [] });
                }

                if (action === 'nametime') {
                    return interaction.showModal(nameTimeModal(`evt:${evId}:nametime`, ev));
                }
                if (action === 'setdate') {
                    const modal = new ModalBuilder().setCustomId(`evt:${evId}:setdate`).setTitle('One-time Date');
                    modal.addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('date').setLabel('Date (YYYY-MM-DD)').setStyle(TextInputStyle.Short)
                            .setRequired(true).setPlaceholder('2026-07-01').setValue(ev.date || '')
                    ));
                    return interaction.showModal(modal);
                }
                if (action === 'toggle') {
                    ev.enabled = ev.enabled === false;
                    await persist();
                    return interaction.update(getEventEditPanel(ev));
                }
                if (action === 'delete') {
                    config.events = config.events.filter(e => e.id !== evId);
                    await persist();
                    return interaction.update({ content: `🗑️ Deleted **${ev.name}**.`, components: [] });
                }
                if (action === 'done') {
                    return interaction.update({ content: `✅ Saved **${ev.emoji} ${ev.name}**.`, components: [] });
                }
            }

            // ----- Guild-wide settings -----
            if (id === 'set_start') {
                return interaction.reply({
                    content: "Choose start date (interval anchor):",
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('start_today').setLabel('Today').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('start_tomorrow').setLabel('Tomorrow').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId('start_day_after').setLabel('Day After').setStyle(ButtonStyle.Secondary)
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (id.startsWith('start_')) {
                let offset = 0;
                if (id === 'start_tomorrow') offset = 1;
                if (id === 'start_day_after') offset = 2;

                const now = new Date();
                // Store a plain UTC calendar date ("YYYY-MM-DD"), not an instant. Storing a
                // timestamp made the panel render the day in the viewer's local zone, so a
                // UTC+offset user saw "today" while the stored UTC day was the day before —
                // pushing interval events off their cycle. A date-only value is unambiguous.
                const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
                    .toISOString().slice(0, 10);
                config.startDate = startDate;
                await persist();
                return interaction.update({ content: `✅ Start set: ${startDate} (UTC)`, components: [] });
            }

            if (id === 'set_channel') {
                return interaction.reply({
                    content: "Select channel:",
                    components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('channel_select'))],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (id === 'set_role') {
                return interaction.reply({
                    content: "Select role:",
                    components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('role_select'))],
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // ----- String select menus -----
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;

            if (id === 'evt_edit_select') {
                const ev = findEvent(config, interaction.values[0]);
                if (!ev) return interaction.update({ content: '⚠️ That event no longer exists.', components: [] });
                return interaction.update(getEventEditPanel(ev));
            }

            if (id === 'evt_remove_select') {
                const ev = findEvent(config, interaction.values[0]);
                if (!ev) return interaction.update({ content: '⚠️ That event no longer exists.', components: [] });
                config.events = config.events.filter(e => e.id !== ev.id);
                await persist();
                return interaction.update({ content: `🗑️ Removed **${ev.name}**.`, components: [] });
            }

            if (id.startsWith('evt:')) {
                const [, evId, field] = id.split(':');
                const ev = findEvent(config, evId);
                if (!ev) return interaction.update({ content: '⚠️ That event no longer exists.', components: [] });

                if (field === 'type') ev.type = interaction.values[0];
                else if (field === 'emoji') ev.emoji = interaction.values[0];
                else if (field === 'lead') ev.lead = Number(interaction.values[0]);
                else if (field === 'days') ev.days = interaction.values.map(Number).sort((a, b) => a - b);
                else if (field === 'interval') ev.intervalHours = Number(interaction.values[0]);

                await persist();
                return interaction.update(getEventEditPanel(ev));
            }
        }

        // ----- Channel / Role pickers -----
        if (interaction.isChannelSelectMenu()) {
            config.channelId = interaction.values[0];
            await persist();
            return interaction.update({ content: "✅ Channel set", components: [] });
        }

        if (interaction.isRoleSelectMenu()) {
            config.mentionRole = interaction.values[0];
            await persist();
            return interaction.update({ content: "✅ Role set", components: [] });
        }

        // ----- Modal submits -----
        if (interaction.isModalSubmit()) {
            const id = interaction.customId;

            if (id === 'evt_addmodal') {
                const name = interaction.fields.getTextInputValue('name').trim();
                const time = interaction.fields.getTextInputValue('time').trim();
                const message = interaction.fields.getTextInputValue('message').trim();
                if (!TIME_REGEX.test(time)) {
                    return interaction.reply({ content: `❌ Invalid time \`${time}\`. Use 24h \`HH:MM\` (e.g. \`16:50\`).`, flags: MessageFlags.Ephemeral });
                }
                if (config.events.length >= MAX_EVENTS) {
                    return interaction.reply({ content: `❌ Limit reached (${MAX_EVENTS} events).`, flags: MessageFlags.Ephemeral });
                }
                const ev = newEvent({ name: name || 'New Event', time, message: message || null });
                config.events.push(ev);
                await persist();
                return interaction.reply(getEventEditPanel(ev));
            }

            if (id.startsWith('evt:')) {
                const [, evId, field] = id.split(':');
                const ev = findEvent(config, evId);
                if (!ev) return interaction.reply({ content: '⚠️ That event no longer exists.', flags: MessageFlags.Ephemeral });

                if (field === 'nametime') {
                    const name = interaction.fields.getTextInputValue('name').trim();
                    const time = interaction.fields.getTextInputValue('time').trim();
                    const message = interaction.fields.getTextInputValue('message').trim();
                    if (!TIME_REGEX.test(time)) {
                        return interaction.reply({ content: `❌ Invalid time \`${time}\`. Use 24h \`HH:MM\`.`, flags: MessageFlags.Ephemeral });
                    }
                    ev.name = name || ev.name;
                    ev.time = time;
                    ev.message = message || null;
                    await persist();
                    return interaction.update(getEventEditPanel(ev));
                }

                if (field === 'setdate') {
                    const date = interaction.fields.getTextInputValue('date').trim();
                    if (!DATE_REGEX.test(date) || isNaN(Date.parse(date))) {
                        return interaction.reply({ content: `❌ Invalid date \`${date}\`. Use \`YYYY-MM-DD\`.`, flags: MessageFlags.Ephemeral });
                    }
                    ev.date = date;
                    await persist();
                    return interaction.update(getEventEditPanel(ev));
                }
            }
        }

    } catch (err) {
        log(`❌ [${gid}] interaction error:`, err);
    }
});

// ===== READY =====
client.once(Events.ClientReady, () => {
    log(`✅ Logged in as ${client.user.tag}`);

    client.application.commands.set([
        { name: "config", description: "Open panel" },
        { name: "today", description: "Show today's and tomorrow's reminders (UTC)" }
    ])
        .then(() => log("🔧 Registered global /config command"))
        .catch(err => log("❌ Failed to register commands:", err));

    const allConfig = loadConfig();
    const guildIds = Object.keys(allConfig);
    log(`🗂️  Loaded config for ${guildIds.length} guild(s)`);
    for (const guildId of guildIds) {
        const config = getGuildConfig(allConfig, guildId);
        saveGuildConfig(guildId, config); // persist any migration to the new shape
        scheduleJobs(guildId, config);
    }
});

// Bot added/re-added to a server while running: resume reminders from saved config.
// (Fires only on genuine joins, not for guilds already present at startup, so it does not
// collide with the ClientReady scheduling loop above.)
client.on(Events.GuildCreate, guild => {
    log(`➕ Joined guild ${guild.id} (${guild.name}) — resuming schedule`);
    const config = getGuildConfig(loadConfig(), guild.id);
    saveGuildConfig(guild.id, config); // persist any migration for brand-new guilds
    scheduleJobs(guild.id, config);
});

// Bot removed/kicked (or guild outage): cancel live jobs; keep saved config so a future
// re-add restores everything.
client.on(Events.GuildDelete, guild => {
    log(`➖ Left guild ${guild.id} (${guild.name || ''}) — cancelling jobs (config kept)`);
    clearJobs(guild.id);
});

client.on('error', err => log("❌ client error:", err));
client.on('warn', msg => log("⚠️  client warn:", msg));

// ===== TOKEN =====
if (!process.env.DC_TOKEN) {
    log("❌ DC_TOKEN is not set. Add it to your .env file.");
    process.exit(1);
}

log("🔌 Logging in to Discord...");
client.login(process.env.DC_TOKEN)
    .catch(err => {
        log("❌ Login failed:", err.message);
        process.exit(1);
    });
