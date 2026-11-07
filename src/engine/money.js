// money.js - ekonomi/ledger. Alltid heltal kronor, saldon får bli negativa.

import { countFaceCards } from './cards.js';

export const TX = {
  ROUND_LOSS: 'round_loss',
  ROUND_PAYMENT: 'round_payment',
  SLASK_PAYMENT: 'slask_payment',
  SLASK_REWARD: 'slask_reward',
};

/**
 * Multiplier för rundan.
 * settings.multiplierMode: 'fixed' | 'flop'
 * settings.multiplierValue: talet vid 'fixed' (1,2,3,4,5,10,25,50,100)
 * settings.flopMultFactor:  N vid 'flop' (flopmult xN), flopvärde * N
 */
export function resolveMultiplier(settings, flopCardRank) {
  if (settings.multiplierMode === 'flop') {
    const factor = Math.max(1, settings.flopMultFactor || 1);
    return flopCardRank * factor;
  }
  return Math.max(1, settings.multiplierValue || 1);
}

/**
 * Normal utbetalning: losern betalar slutvärde * multiplier till VARJE annan spelare.
 * Returnerar en lista transaktioner (heltal).
 */
export function calculateRoundPayments({ playerIds, loserId, loserValue, multiplier }) {
  const amount = Math.round(loserValue * multiplier);
  const others = playerIds.filter((id) => id !== loserId);
  const txs = others.map((id) => ({
    playerId: id,
    amount,
    type: TX.ROUND_PAYMENT,
    note: `Betalning från loser`,
  }));
  txs.push({
    playerId: loserId,
    amount: -amount * others.length,
    type: TX.ROUND_LOSS,
    note: `${loserValue} x ${multiplier} till ${others.length} spelare`,
  });
  return txs;
}

/**
 * Slaskbetalning efter att slasken synats.
 *  - face cards i den gamla handen: slaskaren betalar 10 kr per face card till synaren
 *  - inga face cards: synaren betalar 25 kr till slaskaren
 */
export function calculateSlaskPayment({ slaskerId, callerId, oldHand }) {
  const faces = countFaceCards(oldHand);
  if (faces > 0) {
    const amount = faces * 10;
    return {
      faceCards: faces,
      amount,
      txs: [
        { playerId: slaskerId, amount: -amount, type: TX.SLASK_PAYMENT, note: `${faces} face card(s)` },
        { playerId: callerId, amount, type: TX.SLASK_REWARD, note: `Synade slask (${faces} face cards)` },
      ],
    };
  }
  return {
    faceCards: 0,
    amount: 25,
    txs: [
      { playerId: callerId, amount: -25, type: TX.SLASK_PAYMENT, note: 'Inga face cards' },
      { playerId: slaskerId, amount: 25, type: TX.SLASK_REWARD, note: 'Inga face cards' },
    ],
  };
}

/** Atomisk tillämpning: antingen bokförs alla transaktioner, eller ingen. */
export function applyTransactions(players, txs, meta = {}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const tx of txs) {
    if (!byId.has(tx.playerId)) throw new Error(`Okänd spelare i transaktion: ${tx.playerId}`);
    if (!Number.isInteger(tx.amount)) throw new Error('Belopp måste vara heltal');
  }
  const entries = [];
  for (const tx of txs) {
    const p = byId.get(tx.playerId);
    p.balance += tx.amount;
    entries.push({
      ...tx,
      ...meta,
      nickname: p.nickname,
      balanceAfter: p.balance,
      ts: Date.now(),
    });
  }
  return entries;
}
