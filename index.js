const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

// === CONFIGURATION (Using Render Environment Variables) ===
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// Safety check: Ensure variables exist before starting
if (!TOKEN || !CLIENT_ID) {
    console.error("❌ Missing TOKEN or CLIENT_ID! Please add them to your Environment Variables in Render.");
    process.exit(1); // Stop the script
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// In-memory dictionary to store balances
const balances = {};

// Helper function to get live BTC price from Binance API
async function getBtcPrice() {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const data = await response.json();
    return parseFloat(data.price);
}

// Define the Slash Commands
const commands =[
    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily free coins to bet with!'),
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your fake coin balance'),
    new SlashCommandBuilder()
        .setName('bet')
        .setDescription('Bet if BTC will go Up or Down in the next 60 seconds!')
        .addStringOption(option =>
            option.setName('direction')
                .setDescription('Will BTC go up or down?')
                .setRequired(true)
                .addChoices(
                    { name: 'Up 📈', value: 'up' },
                    { name: 'Down 📉', value: 'down' }
                ))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('How many coins to bet')
                .setRequired(true))
].map(command => command.toJSON());

// Sync commands and log in
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Started refreshing application (/) commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully reloaded application (/) commands!');
    } catch (error) {
        console.error(error);
    }
});

// Handle Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user } = interaction;
    const userId = user.id;

    // --- /DAILY COMMAND ---
    if (commandName === 'daily') {
        if (!balances[userId]) {
            balances[userId] = 1000;
            await interaction.reply("👋 Welcome to CryptoBet! You received **1,000 coins**.");
        } else {
            balances[userId] += 1000;
            await interaction.reply(`💰 You claimed your free coins! New balance: **${balances[userId]} coins**.`);
        }
    }

    // --- /BALANCE COMMAND ---
    if (commandName === 'balance') {
        const bal = balances[userId] || 0;
        await interaction.reply(`🏦 Your current balance is: **${bal} coins**`);
    }

    // --- /BET COMMAND ---
    if (commandName === 'bet') {
        const direction = interaction.options.getString('direction');
        const amount = interaction.options.getInteger('amount');
        const bal = balances[userId] || 0;

        if (amount <= 0) {
            return interaction.reply({ content: "Bet amount must be greater than 0!", ephemeral: true });
        }
        if (bal < amount) {
            return interaction.reply({ content: `❌ Not enough coins! Your balance is only **${bal}**.`, ephemeral: true });
        }

        balances[userId] -= amount;

        let startPrice;
        try {
            startPrice = await getBtcPrice();
        } catch (err) {
            balances[userId] += amount; 
            return interaction.reply({ content: "❌ Error fetching BTC price from Binance. Try again later.", ephemeral: true });
        }

        const directionName = direction === 'up' ? 'Up 📈' : 'Down 📉';
        await interaction.reply(
            `🎰 **Bet placed!** You bet **${amount} coins** that BTC will go **${directionName}**.\n` +
            `💵 Current Price: **$${startPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}**\n\n` +
            `⏳ *Checking back in 60 seconds...*`
        );

        setTimeout(async () => {
            let endPrice;
            try {
                endPrice = await getBtcPrice();
            } catch (err) {
                balances[userId] += amount; 
                return interaction.followUp(`<@${userId}> ❌ Error fetching new price. Your **${amount} coins** were refunded.`);
            }

            let won = false;
            let tie = false;

            if (endPrice > startPrice && direction === "up") won = true;
            else if (endPrice < startPrice && direction === "down") won = true;
            else if (endPrice === startPrice) tie = true;

            const startStr = startPrice.toLocaleString('en-US', { minimumFractionDigits: 2 });
            const endStr = endPrice.toLocaleString('en-US', { minimumFractionDigits: 2 });
            let msg = "";

            if (won) {
                const winnings = amount * 2;
                balances[userId] += winnings;
                msg = `🎉 **YOU WON!** \nBTC moved from **$${startStr}** ➔ **$${endStr}**.\nYou won **${winnings} coins**! (New balance: ${balances[userId]})`;
            } else if (tie) {
                balances[userId] += amount;
                msg = `🤝 **TIE!** \nBTC stayed exactly at **$${startStr}**.\nYour **${amount} coins** were refunded. (New balance: ${balances[userId]})`;
            } else {
                msg = `💀 **YOU LOST!** \nBTC moved from **$${startStr}** ➔ **$${endStr}**.\nYou lost **${amount} coins**. (New balance: ${balances[userId]})`;
            }

            await interaction.followUp(`<@${userId}> ${msg}`);
        }, 60000); 
    }
});

client.login(TOKEN);
