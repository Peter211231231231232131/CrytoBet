const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');

// --- TINY WEB SERVER TO FOOL RENDER ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));
// ---------------------------------------

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error("❌ Missing TOKEN or CLIENT_ID!");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const balances = {};

async function getBtcPrice() {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await response.json();
    return parseFloat(data.price);
}

const commands =[
    new SlashCommandBuilder().setName('daily').setDescription('Claim 1,000 free coins'),
    new SlashCommandBuilder().setName('balance').setDescription('Check your coins'),
    new SlashCommandBuilder()
        .setName('bet')
        .setDescription('Bet on BTC (60s)')
        .addStringOption(opt => opt.setName('direction').setDescription('Up or Down').setRequired(true).addChoices({name:'Up', value:'up'},{name:'Down', value:'down'}))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to bet').setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Commands synced!');
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, user } = interaction;
    const userId = user.id;

    if (commandName === 'daily') {
        balances[userId] = (balances[userId] || 0) + 1000;
        return interaction.reply(`💰 Balance: **${balances[userId]}**`);
    }

    if (commandName === 'balance') {
        return interaction.reply(`🏦 Balance: **${balances[userId] || 0}**`);
    }

    if (commandName === 'bet') {
        const direction = interaction.options.getString('direction');
        const amount = interaction.options.getInteger('amount');
        const bal = balances[userId] || 0;

        if (amount <= 0 || bal < amount) return interaction.reply({ content: "Invalid amount or no money!", ephemeral: true });

        balances[userId] -= amount;
        const startPrice = await getBtcPrice();

        await interaction.reply(`🎰 Bet placed at **$${startPrice.toLocaleString()}**! Waiting 60s...`);

        setTimeout(async () => {
            const endPrice = await getBtcPrice();
            let won = (endPrice > startPrice && direction === 'up') || (endPrice < startPrice && direction === 'down');
            
            if (won) {
                balances[userId] += amount * 2;
                await interaction.followUp(`<@${userId}> 🎉 WIN! BTC: $${endPrice.toLocaleString()}. New Balance: ${balances[userId]}`);
            } else {
                await interaction.followUp(`<@${userId}> 💀 LOSS! BTC: $${endPrice.toLocaleString()}. New Balance: ${balances[userId]}`);
            }
        }, 60000);
    }
});

client.login(TOKEN);
