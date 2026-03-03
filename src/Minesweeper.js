const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
const { disableButtons, getNumEmoji, formatMessage, ButtonBuilder } = require('../utils/utils');
const events = require('events');

module.exports = class Minesweeper extends events {
  constructor(options = {}) {
    if (!options.isSlashGame) options.isSlashGame = false;
    if (!options.message) throw new TypeError('NO_MESSAGE: No message option was provided.');
    if (typeof options.message !== 'object') throw new TypeError('INVALID_MESSAGE: message option must be an object.');
    if (typeof options.isSlashGame !== 'boolean') throw new TypeError('INVALID_COMMAND_TYPE: isSlashGame option must be a boolean.');

    if (!options.embed) options.embed = {};
    if (!options.embed.title) options.embed.title = 'Minesweeper';
    if (!options.embed.color) options.embed.color = '#5865F2';
    if (!options.embed.description) options.embed.description = 'Click on the buttons to reveal the blocks except mines.';

    if (!options.emojis) options.emojis = {};
    if (!options.emojis.flag) options.emojis.flag = '🚩';
    if (!options.emojis.mine) options.emojis.mine = '💣';

    if (!options.mines) options.mines = 5;
    if (!options.timeoutTime) options.timeoutTime = 60000;
    if (!options.winMessage) options.winMessage = 'You won the Game! You successfully avoided all the mines.';
    if (!options.loseMessage) options.loseMessage = 'You lost the Game! Beware of the mines next time.';
    if (!options.timeoutMessage) options.timeoutMessage = 'The game went unanswered for a few minutes and was dropped!';

    if (typeof options.embed !== 'object') throw new TypeError('INVALID_EMBED: embed option must be an object.');
    if (typeof options.embed.title !== 'string') throw new TypeError('INVALID_EMBED: embed title must be a string.');
    if (typeof options.embed.color !== 'string') throw new TypeError('INVALID_EMBED: embed color must be a string.');
    if (typeof options.embed.description !== 'string') throw new TypeError('INVALID_EMBED: embed description must be a string.');
    if (typeof options.emojis !== 'object') throw new TypeError('INVALID_EMOJIS: emojis option must be an object.');
    if (typeof options.emojis.flag !== 'string') throw new TypeError('INVALID_EMOJIS: flag emoji must be a string.');
    if (typeof options.emojis.mine !== 'string') throw new TypeError('INVALID_EMOJIS: mine emoji must be a string.');
    if (typeof options.mines !== 'number') throw new TypeError('INVALID_MINES: mines option must be a number.');
    if (typeof options.timeoutTime !== 'number') throw new TypeError('INVALID_TIME: Timeout time option must be a number.');
    if (typeof options.winMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Win Message option must be a string.');
    if (typeof options.loseMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Lose Message option must be a string.');
    if (typeof options.timeoutMessage !== 'string') throw new TypeError('INVALID_MESSAGE: Timeout Message option must be a string.');
    if (options.mines < 1 || options.mines > 24) throw new RangeError('INVALID_MINES: mines option must be between 1 and 24.');
    if (options.playerOnlyMessage !== false) {
      if (!options.playerOnlyMessage) options.playerOnlyMessage = 'Only {player} can use these buttons.';
      if (typeof options.playerOnlyMessage !== 'string') throw new TypeError('INVALID_MESSAGE: playerOnly Message option must be a string.');
    }

    super();
    this.options = options;
    this.message = options.message;
    this.emojis = options.emojis;
    this.gameBoard = [];
    this.length = 5;

    for (let y = 0; y < this.length; y++) {
      for (let x = 0; x < this.length; x++) {
        this.gameBoard[y * this.length + x] = false;
      }
    }
  }

  async sendMessage(content) {
    if (this.options.isSlashGame) return await this.message.editReply(content).catch(() => {});
    else return await this.message.channel.send(content).catch(() => {});
  }

  async startGame() {
    if (this.options.isSlashGame || !this.message.author) {
      if (!this.message.deferred) await this.message.deferReply().catch(() => {});
      this.message.author = this.message.user;
      this.options.isSlashGame = true;
    }
    this.plantMines();
    this.showFirstBlock();

    const embed = new EmbedBuilder()
        .setColor(this.options.embed.color)
        .setTitle(this.options.embed.title)
        .setDescription(this.options.embed.description)

    const msg = await this.sendMessage({ embeds: [embed], components: this.getComponents() });
    return this.handleButtons(msg);
  }

  handleButtons(msg) {
    if (!msg) return;
    const collector = msg.createMessageComponentCollector({ idle: this.options.timeoutTime });

    collector.on('collect', async btn => {
      if (btn.user.id !== this.message.author.id) {
        if (this.options.playerOnlyMessage) {
          return btn.reply({ content: formatMessage(this.options, 'playerOnlyMessage'), ephemeral: true }).catch(() => {});
        }
        return;
      }

      await btn.deferUpdate().catch(() => {});

      const x = parseInt(btn.customId.split('_')[1]);
      const y = parseInt(btn.customId.split('_')[2]);
      const index = (y * this.length + x);

      if (this.gameBoard[index] === true) return collector.stop('mine');

      this.gameBoard[index] = this.getMinesAround(x, y);

      if (this.foundAllMines()) return collector.stop('win');

      return await btn.editReply({ components: this.getComponents() }).catch(() => {});
    });

    collector.on('end', async (_, reason) => {
      if (['win', 'mine', 'user', 'idle'].includes(reason)) {
        return this.gameOver(msg, this.foundAllMines(), reason === 'idle');
      }
    });
  }

  gameOver(msg, result, isTimeout = false) {
    const MinesweeperGame = { player: this.message.author, blocksTurned: this.gameBoard.filter(Number.isInteger).length };
    this.emit('gameOver', { result: isTimeout ? 'timeout' : (result ? 'win' : 'lose'), ...MinesweeperGame });

    for (let y = 0; y < this.length; y++) {
      for (let x = 0; x < this.length; x++) {
        const index = (y * this.length + x);
        if (this.gameBoard[index] !== true) this.gameBoard[index] = this.getMinesAround(x, y);
      }
    }

    const embed = new EmbedBuilder()
        .setColor(this.options.embed.color)
        .setTitle(this.options.embed.title)
        .setDescription(isTimeout ? this.options.timeoutMessage : (result ? this.options.winMessage : this.options.loseMessage))

    return msg.edit({ embeds: [embed], components: disableButtons(this.getComponents(true, result)) }).catch(() => {});
  }

  plantMines() {
    let planted = 0;
    while (planted < this.options.mines) {
      const x = Math.floor(Math.random() * this.length);
      const y = Math.floor(Math.random() * this.length);
      const index = (y * this.length + x);

      if (this.gameBoard[index] !== true) {
        this.gameBoard[index] = true;
        planted++;
      }
    }
  }

  getMinesAround(x, y) {
    let minesAround = 0;
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        if (row === 0 && col === 0) continue;
        const nx = x + col;
        const ny = y + row;
        if (nx >= 0 && nx < this.length && ny >= 0 && ny < this.length) {
          if (this.gameBoard[ny * this.length + nx] === true) minesAround++;
        }
      }
    }
    return minesAround;
  }

  showFirstBlock() {
    const emptyBlocks = [];
    const allBlocks = [];

    for (let y = 0; y < this.length; y++) {
      for (let x = 0; x < this.length; x++) {
        if (this.gameBoard[y * this.length + x] === false) {
          allBlocks.push({ x, y });
          if (this.getMinesAround(x, y) === 0) emptyBlocks.push({ x, y });
        }
      }
    }

    const pool = emptyBlocks.length ? emptyBlocks : allBlocks;
    const rBlock = pool[Math.floor(Math.random() * pool.length)];
    this.gameBoard[rBlock.y * this.length + rBlock.x] = this.getMinesAround(rBlock.x, rBlock.y);
  }

  foundAllMines() {
    for (let i = 0; i < this.gameBoard.length; i++) {
      if (this.gameBoard[i] === false) return false;
    }
    return true;
  }

  getComponents(showMines, found) {
    const components = [];

    for (let y = 0; y < this.length; y++) {
      const row = new ActionRowBuilder();
      for (let x = 0; x < this.length; x++) {
        const block = this.gameBoard[y * this.length + x];

        const isRevealed = typeof block === 'number';
        const isNumber = isRevealed ? getNumEmoji(block) : null;
        const displayMine = Boolean(block === true && showMines);

        let style = 'PRIMARY';

        if (displayMine) {
          style = found ? 'SUCCESS' : 'DANGER';
        } else if (isRevealed) {
          style = 'SECONDARY';
        }

        const btn = new ButtonBuilder()
            .setStyle(style)
            .setCustomId(`minesweeper_${x}_${y}`)
            .setDisabled(isRevealed);

        if (displayMine) {
          btn.setEmoji(found ? this.emojis.flag : this.emojis.mine);
        } else if (isRevealed) {
          if (isNumber) btn.setEmoji(isNumber);
          else btn.setLabel('\u200b');
        } else {
          btn.setLabel('\u200b');
        }

        row.addComponents(btn);
      }
      components.push(row);
    }

    return components;
  }
}

