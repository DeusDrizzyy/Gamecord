const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
const { getAlphaEmoji, formatMessage, ButtonBuilder } = require('../utils/utils');
const defaultWords = require('../utils/words.json');
const events = require('events');

module.exports = class Hangman extends events {
    constructor(options = {}) {
        super();

        if (!options.isSlashGame) options.isSlashGame = false;
        if (!options.message) throw new TypeError('NO_MESSAGE: No message option was provided.');
        if (typeof options.message !== 'object') throw new TypeError('INVALID_MESSAGE: message option must be an object.');
        if (typeof options.isSlashGame !== 'boolean') throw new TypeError('INVALID_COMMAND_TYPE: isSlashGame option must be a boolean.');

        if (!options.embed) options.embed = {};
        if (!options.embed.title) options.embed.title = 'Hangman';
        if (!options.embed.color) options.embed.color = '#5865F2';

        if (!options.hangman) options.hangman = {};
        if (!options.hangman.hat) options.hangman.hat = '🎩';
        if (!options.hangman.head) options.hangman.head = '😟';
        if (!options.hangman.shirt) options.hangman.shirt = '👕';
        if (!options.hangman.pants) options.hangman.pants = '🩳';
        if (!options.hangman.boots) options.hangman.boots = '👞👞';

        this.words = typeof options.words === 'object' ? options.words : defaultWords;

        if (!options.customWord) options.customWord = null;
        if (!options.timeoutTime) options.timeoutTime = 60000;
        if (!options.theme) options.theme = Object.keys(this.words)[Math.floor(Math.random() * Object.keys(this.words).length)];

        if (!options.winMessage) options.winMessage = 'You won! The word was **{word}**.';
        if (!options.loseMessage) options.loseMessage = 'You lost! The word was **{word}**.';
        if (!options.wordMessage) options.wordMessage = 'Word ({length})';
        if (!options.lettersGuessedMessage) options.lettersGuessedMessage = 'Letters Guessed';
        if (!options.gameOverMessage) options.gameOverMessage = 'Game Over';
        if (!options.stopButtonLabel) options.stopButtonLabel = 'Stop';

        if (typeof options.embed !== 'object') throw new TypeError('INVALID_EMBED: embed option must be an object.');
        if (typeof options.embed.title !== 'string') throw new TypeError('INVALID_EMBED: embed title must be a string.');
        if (typeof options.embed.color !== 'string') throw new TypeError('INVALID_EMBED: embed color must be a string.');
        if (typeof options.hangman !== 'object') throw new TypeError('INVALID_HANGMAN: hangman option must be an object.');
        if (typeof options.hangman.hat !== 'string') throw new TypeError('INVALID_HANGMAN: hangman hat must be a string.');
        if (typeof options.hangman.head !== 'string') throw new TypeError('INVALID_HANGMAN: hangman head must be a string.');
        if (typeof options.hangman.shirt !== 'string') throw new TypeError('INVALID_HANGMAN: hangman shirt must be a string.');
        if (typeof options.hangman.pants !== 'string') throw new TypeError('INVALID_HANGMAN: hangman pants must be a string.');
        if (typeof options.hangman.boots !== 'string') throw new TypeError('INVALID_HANGMAN: hangman boots must be a string.');
        if (typeof options.timeoutTime !== 'number') throw new TypeError('INVALID_TIME: Timeout time option must be a number.');
        if (typeof options.winMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Win Message option must be a string.');
        if (typeof options.loseMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Lose Message option must be a string.');
        if (typeof options.wordMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Word Message option must be a string.');
        if (typeof options.lettersGuessedMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Letters Guessed Message option must be a string.');
        if (typeof options.gameOverMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Game Over Message option must be a string.');
        if (typeof options.stopButtonLabel !== 'string') throw new TypeError('INVALID_MESSAGE: Stop Button Label option must be a string.');
        if (typeof options.theme !== 'string') throw new TypeError('INVALID_THEME: theme option must be a string.');
        if (!this.words[options.theme] && !options.customWord) throw new Error('INVALID_THEME: The specified theme does not exist in the words dictionary.');
        if (options.playerOnlyMessage !== false) {
            if (!options.playerOnlyMessage) options.playerOnlyMessage = 'Only {player} can use these buttons.';
            if (typeof options.playerOnlyMessage !== 'string') throw new TypeError('INVALID_MESSAGE: playerOnly Message option must be a string.');
        }

        this.options = options;
        this.message = options.message;
        this.hangman = options.hangman;
        this.word = options.customWord;
        this.buttonPage = 0;
        this.guessed = [];
        this.damage = 0;
    }

    getBoardContent() {
        return [
            '```',
            '┏━━━━━━━┓',
            `┃      ${this.damage > 0 ? this.hangman.hat : ''}`,
            `┃      ${this.damage > 1 ? this.hangman.head : ''}`,
            `┃      ${this.damage > 2 ? this.hangman.shirt : ''}`,
            `┃      ${this.damage > 3 ? this.hangman.pants : ''}`,
            `┃     ${this.damage > 4 ? this.hangman.boots : ''}`,
            '┗━━━━━━━━━━━━━',
            '```',
        ].join('\n');
    }

    buildEmbed(isGameOver = false, result = false) {
        const embed = new EmbedBuilder()
            .setColor(this.options.embed.color)
            .setTitle(this.options.embed.title)
            .setDescription(this.getBoardContent());

        if (this.guessed.length) {
            embed.addFields({ name: this.options.lettersGuessedMessage, value: '`' + this.guessed.join(', ') + '`' });
        }

        if (isGameOver) {
            const GameOverMessage = result ? this.options.winMessage : this.options.loseMessage;
            embed.addFields({
                name: this.options.gameOverMessage,
                value: GameOverMessage.replace('{word}', this.word).replace('{theme}', this.options.theme),
            });
        } else {
            embed.addFields({
                name: this.options.wordMessage.replace('{length}', this.word.length).replace('{theme}', this.options.theme),
                value: this.getWordEmojis(),
            });
        }

        return embed;
    }

    async sendMessage(content) {
        if (this.options.isSlashGame) return await this.message.editReply(content).catch(() => {
        });
        return await this.message.channel.send(content).catch(() => {
        });
    }

    async startGame() {
        if (this.options.isSlashGame || !this.message.author) {
            if (!this.message.deferred) await this.message.deferReply().catch(() => {
            });
            this.message.author = this.message.user;
            this.options.isSlashGame = true;
        }

        if (!this.word) {
            const themeWords = this.words[this.options.theme];
            this.word = themeWords[Math.floor(Math.random() * themeWords.length)];
        }

        const msg = await this.sendMessage({ embeds: [this.buildEmbed()], components: this.getComponents() });
        return this.handleButtons(msg);
    }

    handleButtons(msg) {
        if (!msg) return;
        const collector = msg.createMessageComponentCollector({ idle: this.options.timeoutTime });

        collector.on('collect', async btn => {
            if (collector.ended) return btn.deferUpdate().catch(() => {
            });

            if (btn.user.id !== this.message.author.id) {
                if (this.options.playerOnlyMessage) {
                    return btn.reply({
                        content: formatMessage(this.options, 'playerOnlyMessage'),
                        ephemeral: true,
                    }).catch(() => {
                    });
                }
                return;
            }

            const guess = btn.customId.split('_')[1];

            if (guess === 'stop') {
                collector.stop('user');
                return this.gameOver(msg, false, btn);
            }

            if (guess === '0' || guess === '1') {
                return btn.update({ components: this.getComponents(parseInt(guess)) }).catch(() => {
                });
            }

            if (this.guessed.includes(guess)) {
                return btn.deferUpdate().catch(() => {
                });
            }

            this.guessed.push(guess);

            if (!this.word.toUpperCase().includes(guess)) this.damage += 1;

            if (this.damage > 4 || this.foundWord()) {
                collector.stop('handled');
                return this.gameOver(msg, this.foundWord(), btn);
            }

            return btn.update({ embeds: [this.buildEmbed()], components: this.getComponents() }).catch(() => {
            });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'idle') return this.gameOver(msg, false);
        });
    }

    gameOver(msg, result, btn = null) {
        const HangmanGame = {
            player: this.message.author,
            word: this.word,
            damage: this.damage,
            guessed: this.guessed,
        };
        this.emit('gameOver', { result: (result ? 'win' : 'lose'), ...HangmanGame });

        if (btn) {
            return btn.update({ embeds: [this.buildEmbed(true, result)], components: [] }).catch(() => {
            });
        }
        return msg.edit({ embeds: [this.buildEmbed(true, result)], components: [] }).catch(() => {
        });
    }

    foundWord() {
        return this.word.toUpperCase().replace(/ /g, '').split('').every(l => this.guessed.includes(l));
    }

    getWordEmojis() {
        return this.word.toUpperCase().split('').map(l => this.guessed.includes(l) ? getAlphaEmoji(l) : ((l === ' ') ? '⬜' : '🔵')).join(' ');
    }

    getComponents(page) {
        const components = [];
        if (page === 0 || page === 1) this.buttonPage = page;
        const letters = getAlphaEmoji(this.buttonPage ?? 0);
        const pageID = ('hangman_' + (this.buttonPage ? 0 : 1));

        for (let y = 0; y < 3; y++) {
            const row = new ActionRowBuilder();
            for (let x = 0; x < 4; x++) {
                const letter = letters[y * 4 + x];
                const btn = new ButtonBuilder()
                    .setStyle('PRIMARY')
                    .setLabel(letter)
                    .setCustomId(`hangman_${letter}`)
                    .setDisabled(this.guessed.includes(letter));
                row.addComponents(btn);
            }
            components.push(row);
        }

        const row4 = new ActionRowBuilder();
        const stop = new ButtonBuilder().setStyle('DANGER').setLabel(this.options.stopButtonLabel).setCustomId('hangman_stop');
        const pageBtn = new ButtonBuilder().setStyle('SUCCESS').setEmoji(this.buttonPage ? '⬅️' : '➡️').setCustomId(pageID);
        const letterY = new ButtonBuilder().setStyle('PRIMARY').setLabel('Y').setCustomId('hangman_Y');
        const letterZ = new ButtonBuilder().setStyle('PRIMARY').setLabel('Z').setCustomId('hangman_Z');

        if (this.guessed.includes('Y')) letterY.setDisabled(true);
        if (this.guessed.includes('Z')) letterZ.setDisabled(true);

        row4.addComponents(pageBtn, stop);
        if (this.buttonPage) row4.addComponents(letterY, letterZ);
        components.push(row4);

        return components;
    }
};
