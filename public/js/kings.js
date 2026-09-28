// King's Cup rules and content (unchanged from the original game).
export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RED = new Set(['♥', '♦']);

export const RULES = {
  A: { name: 'Never Have I Ever', emoji: '🙊', desc: 'Everyone holds up 3 fingers. Go around saying things you\'ve never done — anyone who has puts a finger down. First to lose all 3 takes a sip.' },
  2: { name: 'You', emoji: '👉', desc: 'Pick someone to take a sip.', pick: 'Who takes the sip?' },
  3: { name: 'Me', emoji: '🙋', desc: 'That\'s you — take a sip!' },
  4: { name: 'Floor', emoji: '👇', desc: 'Everyone touch the floor! Last one down takes a sip.' },
  5: { name: 'Guys', emoji: '🧔', desc: 'All the guys take a sip.' },
  6: { name: 'Girls', emoji: '💃', desc: 'All the girls take a sip.' },
  7: { name: 'Heaven', emoji: '☝️', desc: 'Point to the sky! Last hand up takes a sip.' },
  8: { name: 'Mate', emoji: '🤝', desc: 'Pick a mate — whenever you sip, they sip too. For the rest of the game!', pick: 'Choose your mate' },
  9: { name: 'Rhyme', emoji: '🎤', desc: 'Say a word. Go around rhyming with it. First to stumble or repeat takes a sip.' },
  10: { name: 'Waterfall', emoji: '🌊', desc: 'Everyone starts sipping at once. You can only stop when the person before you stops.' },
  J: { name: 'Categories', emoji: '🗂️', desc: 'Pick a category. Go around naming things in it. First to blank takes a sip.', category: true },
  Q: { name: 'Question Master', emoji: '❓', desc: 'You\'re the Question Master! Anyone who answers a question you ask must sip — until the next Queen.' },
  K: { name: 'King\'s Cup', emoji: '👑', desc: 'Make a new rule everyone must follow! Pour a splash into the King\'s Cup.', rule: true },
};
export const FOURTH_KING = 'The 4th King! Drink the whole King\'s Cup! 🏆';

export const CATEGORIES = [
  'Dog breeds', 'Pizza toppings', 'Board games', 'Countries in Europe', 'Car makers', 'Ice cream flavours',
  'Musical instruments', 'Fruits', 'Coffee drinks', 'Mythical creatures', 'Dinosaurs', 'Breakfast foods',
  'Types of pasta', 'Cocktails', 'Sea creatures', 'Cities with a subway', 'Things that are red', 'Sports',
  'Words that rhyme with "cat"', 'Things in a kitchen', 'Famous duos', 'Cheese types', 'Planets and moons', 'Card games',
];
export const RULE_IDEAS = [
  'No first names', 'No pointing', 'T-Rex arms while talking', 'British accent until your next turn',
  'No saying "drink"', 'Clap before you speak', 'Thumb Master', 'No swearing', 'Talk like a pirate',
  'Only whisper', 'Pinky up when sipping', 'Questions must be answered with a question', 'No touching your hair',
  'Say "yeehaw" before every sip', 'Ban the letter S', 'Compliment the person on your left',
];

export function buildDeck() { const d = []; for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit }); return d; }

// Gentle mode keeps "sip"; otherwise the classic wording.
export function wordRule(text, gentle) {
  if (gentle) return text.replace(/Drink the whole/, 'Finish the');
  return text.replace(/take a sip/gi, 'drink').replace(/sipping/gi, 'drinking').replace(/\bsips\b/gi, 'drinks').replace(/\bsip\b/gi, 'drink');
}
