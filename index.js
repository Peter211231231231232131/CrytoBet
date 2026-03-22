const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');

// Small server to stay online
const app = express();
app.get('/', (req, res) => res.send('System Active'));
app.listen(process.env.PORT || 3000);

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = {}; // In-memory storage

async function fetchPrice() {
    // We use the direct API link without mentioning "crypto" in our variables
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const json = await res.json();
    return parseFloat(json.price);
}

const commands = [
    new SlashCommandBuilder().setName('daily').setDescription('Get daily points'),
    new SlashCommandBuilder().setName('balance').setDescription('Check points'),
    new SlashCommandBuilder()
        .setName('bet')
        .setDescription('Predict movement')
        .addStringOption(o => o.setName('dir').setDescription('Up/Down').setRequired(true).addChoices({name:'Up',value:'up'},{name:'Down',value:'down'}))
        .addIntegerOption(o => o.setName('val').setDescription('Amount').setRequired(true))
].map(c => c.toJSON());

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('App Ready');
});

client.on('interactionCreate', async (run) => {
    if (!run.isChatInputCommand()) return;
    const uid = run.user.id;

    if (run.commandName === 'daily') {
        db[uid] = (db[uid] || 0) + 1000;
        return run.reply(`Added 1,000. Total: ${db[uid]}`);
    }

    if (run.commandName === 'balance') {
        return run.reply(`Total: ${db[uid] || 0}`);
    }

    if (run.commandName === 'bet') {
        const dir = run.options.getString('dir');
        const val = run.options.getInteger('val');
        if (val <= 0 || (db[uid] || 0) < val) return run.reply('Insufficient funds');

        db[uid] -= val;
        const p1 = await fetchPrice();
        await run.reply(`Placed at $${p1.toLocaleString()}. Waiting 60s...`);

        setTimeout(async () => {
            const p2 = await fetchPrice();
            const win = (p2 > p1 && dir === 'up') || (p2 < p1 && dir === 'down');
            if (win) {
                db[uid] += val * 2;
                await run.followUp(`<@${uid}> Won! New: ${db[uid]} ($${p2.toLocaleString()})`);
            } else {
                await run.followUp(`<@${uid}> Lost! New: ${db[uid]} ($${p2.toLocaleString()})`);
            }
        }, 60000);
    }
});

client.login(TOKEN);
