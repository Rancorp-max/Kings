// Theme metadata, deck loading, placeholder filling and the free (generic) quiz banks.
import { SITE } from './site-config.js';

export const THEMES = {
  'baby-shower': { name: 'Baby Shower', emoji: '🍼', honoree: ['Parent-to-be', 'Partner (optional)'], who: ['Mom', 'Dad'], quiz: true, keepsake: true, predictions: true, noun: 'the parents-to-be' },
  'bridal-shower': { name: 'Bridal Shower', emoji: '💍', honoree: ['Bride', 'Partner (optional)'], who: ['Bride', 'Partner'], quiz: true, keepsake: true, noun: 'the couple' },
  'milestone-birthday': { name: 'Milestone Birthday', emoji: '🎂', honoree: ['Birthday star', ''], who: ['Birthday star', 'Best friend'], quiz: true, keepsake: true, age: true, noun: 'the birthday star' },
  'kings-cup': { name: "King's Cup", emoji: '👑', honoree: null, quiz: false, keepsake: false, ageGate: SITE.ageGate.kingsCupMinAge, noun: 'the table' },
};

const cache = {};
export async function loadDeck(theme) {
  if (!cache[theme]) cache[theme] = fetch(`decks/${theme}.json`).then((r) => { if (!r.ok) throw new Error('deck ' + r.status); return r.json(); });
  return cache[theme];
}

export function honoreeNames(h) { return (h?.names || []).filter(Boolean); }
export function namesText(h, theme) {
  const n = honoreeNames(h);
  return n.length ? n.join(' & ') : (THEMES[theme]?.noun || 'the guest of honour');
}
// {name} first honoree, {names} all of them, {age} milestone.
export function fill(text, h, theme) {
  const n = honoreeNames(h);
  const first = n[0] || (THEMES[theme]?.noun || 'the guest of honour');
  return String(text).replace(/\{names\}/g, namesText(h, theme)).replace(/\{name\}/g, first).replace(/\{age\}/g, h?.age || 'this age');
}

// Generic "Who knows them best?" questions. The host taps the right answer
// (and can edit any option); unanswered questions are skipped.
const Q = (question, options) => ({ question, options, correct: null, source: 'generic' });
export const QUIZ_BANK = {
  'baby-shower': [
    Q('Where did {names} first meet?', ['At school', 'At work', 'Through friends', 'Online']),
    Q("What's {name}'s go-to comfort food?", ['Pizza', 'Pasta', 'Tacos', 'Ice cream']),
    Q('Which baby milestone will {name} film first?', ['First smile', 'First steps', 'First word', 'First taste of food']),
    Q("What's {name}'s dream family vacation?", ['Beach', 'Mountains', 'Big city', 'Road trip']),
    Q('How does {name} take their morning drink?', ['Black coffee', 'Coffee with milk', 'Tea', 'Juice or water']),
    Q("What was {name}'s favourite subject at school?", ['Art', 'Science', 'English', 'Gym']),
    Q('Which chore does {name} secretly enjoy?', ['Laundry', 'Cooking', 'Vacuuming', 'Gardening']),
    Q("What's {name}'s hidden talent?", ['Singing', 'Cooking', 'Dancing', 'Puzzles']),
    Q('What would {name} name a pet goldfish?', ['Bubbles', 'Captain', 'Sir Swims-a-lot', 'Goldie']),
    Q("What's {name} most looking forward to?", ['Bedtime stories', 'First steps', 'Family trips', 'Baby giggles']),
    Q("What's {name}'s favourite season?", ['Spring', 'Summer', 'Autumn', 'Winter']),
    Q('Which song style will {name} sing to the baby?', ['Lullabies', 'Pop hits', 'Rock ballads', 'Made-up songs']),
  ],
  'bridal-shower': [
    Q('Where did {names} meet?', ['At school', 'At work', 'Through friends', 'Online']),
    Q('Who said "I love you" first?', ['{name}', 'Their partner', 'Both at once', 'Still debating!']),
    Q("What's {name}'s favourite date night?", ['Dinner out', 'Movie night in', 'Something active', 'Travel adventure']),
    Q("What's {name}'s signature dish?", ['Pasta', 'Tacos', 'Stir-fry', 'Takeout menus']),
    Q("Where's {names}' dream honeymoon?", ['Tropical beach', 'European city', 'Mountains', 'Road trip']),
    Q('Who is the better cook?', ['{name}', 'Their partner', 'Equally great', 'Neither!']),
    Q("What's {name}'s love language?", ['Words', 'Quality time', 'Gifts', 'Acts of service']),
    Q('How long did {names} date before getting engaged?', ['Under 1 year', '1–2 years', '3–5 years', '6+ years']),
    Q("What's {name}'s go-to karaoke style?", ['Power ballad', 'Pop anthem', 'Rock classic', 'Refuses to sing']),
    Q('Who is more likely to plan a surprise?', ['{name}', 'Their partner', 'Both', 'Neither']),
    Q("What's {name}'s favourite flower?", ['Roses', 'Peonies', 'Sunflowers', 'Tulips']),
    Q('Who takes longer to get ready?', ['{name}', 'Their partner', 'Tie', 'Depends on the event']),
  ],
  'milestone-birthday': [
    Q("What was {name}'s first job?", ['Food service', 'Retail', 'Babysitting', 'Something unusual']),
    Q("What's {name}'s favourite way to celebrate?", ['Big party', 'Quiet dinner', 'Adventure trip', 'Staying in']),
    Q("What's {name}'s go-to comfort food?", ['Pizza', 'Pasta', 'Tacos', 'Dessert first']),
    Q('What did {name} want to be as a kid?', ['Astronaut', 'Teacher', 'Doctor', 'Rock star']),
    Q("What's {name}'s dream destination?", ['Tropical island', 'European city', 'Safari', 'Mountain cabin']),
    Q("What's {name}'s morning drink?", ['Coffee', 'Tea', 'Smoothie', 'Just water']),
    Q("What's {name}'s hidden talent?", ['Singing', 'Cooking', 'Dancing', 'Trivia']),
    Q('Early bird or night owl?', ['Early bird', 'Night owl', 'Both!', 'Permanently tired']),
    Q("What's {name}'s favourite season?", ['Spring', 'Summer', 'Autumn', 'Winter']),
    Q("Which decade's music does {name} love most?", ['70s', '80s', '90s', 'Today']),
    Q('How would {name} spend a surprise day off?', ['Sleeping in', 'Outdoors', 'Seeing friends', 'A new project']),
    Q("What's {name}'s best party trick?", ['Dance moves', 'Great stories', 'Card tricks', 'Karaoke']),
  ],
};

// "Who said it / who's more likely" lines for the two-choice round.
export const WHO_BANK = {
  'baby-shower': ['Who will change the first diaper?', 'Who is more likely to cry at the first school play?', 'Who will be the stricter parent at bedtime?', 'Who will sing to the baby more?', 'Who will be up first when the baby wakes?', 'Who is more likely to over-pack the diaper bag?', 'Who will take the most baby photos?', 'Who will teach the baby to ride a bike?'],
  'bridal-shower': ['Who said "I love you" first?', 'Who is more likely to plan the anniversary trip?', 'Who hogs the blankets?', 'Who is the better dancer?', 'Who apologises first after a disagreement?', 'Who is more likely to get lost on vacation?', 'Who has the better music taste?', 'Who will cry during the vows?'],
  'milestone-birthday': ['Who is more likely to plan a surprise party?', 'Who tells the better stories?', 'Who is more likely to be late?', 'Who is the better cook?'],
};

// Card kinds used by the themed decks (+ 'custom' for AI-personalised cards).
export const KINDS = {
  advice: { label: 'Advice round', emoji: '💡' }, guess: { label: 'Guess!', emoji: '🔮' }, wyr: { label: 'Would you rather', emoji: '⚖️' },
  story: { label: 'Story time', emoji: '📖' }, challenge: { label: 'Challenge', emoji: '⏱️' }, vote: { label: 'Group vote', emoji: '👉' },
  quickfire: { label: 'Quick-fire', emoji: '⚡' }, toast: { label: 'Raise a glass', emoji: '🥂' }, custom: { label: 'Just for you', emoji: '✨' },
};
