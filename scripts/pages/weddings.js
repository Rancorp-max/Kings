'use strict';
// Copy for the wedding guide pages. Tokens: {BRAND}, {WPASS} (Wedding Pass price), {WPLUS} (Plus price),
// {WDJ} (DJ/MC Pro price), {TRIAL} (free-trial guest cap), {PASSG} / {PLUSG} (guest caps).
// Each page: 600–900 words of original, practical content. `events` preselects events in the setup form.

module.exports = [
  {
    slug: 'sangeet-games',
    emoji: '💃',
    events: 'sangeet',
    title: 'Sangeet Games for Every Guest — Team Trivia, Dance-Off Voting & Emoji Songs | {BRAND}',
    description: 'Sangeet night games everyone plays on their phone: bride side vs groom side trivia, dance-off voting, guess-the-song emoji rounds and a live scoreboard on the big screen.',
    h1: 'Sangeet games the whole family can play — from their phones',
    lede: 'Turn the sangeet into a friendly bride-side-versus-groom-side contest. Guests scan one QR code, choose their side, and every round lands on their phone and on the big screen at the same time.',
    sections: [
      { h2: 'Why a sangeet needs games at all', html: `
<p>A sangeet usually has two halves: the rehearsed performances and the long, happy stretch in between when the aunties are ready to dance and the cousins are looking at their phones. Games fill those gaps without stopping the music for long. They also do something performances cannot: they get <em>everyone</em> involved, including the relatives who flew in and don't know the other family yet, the shy friend who will never take the stage, and the grandparents who love a good quiz.</p>
<p>The trick is to keep each round short, loud and team-based. Nobody wants to fill in a paper form at a sangeet. With {BRAND}, guests join once — name, side and an avatar — and they are ready for every round of the night, and for the mehndi and reception too if you have them.</p>` },
      { h2: 'Five sangeet rounds that work', html: `
<h3>1. Bride side vs groom side trivia</h3>
<p>Multiple-choice questions about the couple: where they first met, who said "I love you" first, which of them plans the holidays, whose family is always late. Everyone answers within 20 seconds, and points go to the player <em>and</em> to their side. After each question the scoreboard shows the two families neck and neck, which is exactly the energy you want before the next performance.</p>
<h3>2. Dance-off voting</h3>
<p>After each family's performance — or after an impromptu dance-off between two uncles — the MC opens a vote. Guests tap their favourite on their phones, and the result appears on the screen with a live bar chart. The winning side gets bonus points. Votes are counted on the server, so a crowd of 300 tapping at once is fine.</p>
<h3>3. Guess the song from the emoji</h3>
<p>A classic that works across generations. The screen shows a string of emoji — 👰🎶➡️⛪ — and guests pick the song title from four options. We use song <strong>titles only</strong>, never lyrics, so you can add the couple's favourite film songs without reproducing anyone's words. Mix old classics for the elders with this year's hits for the cousins.</p>
<h3>4. How well do you know the couple?</h3>
<p>A faster, funnier version of trivia: "Who is more likely to cry during the vidaai?" or "Who takes longer to get ready?" Guests choose between the two names, and the couple's real answers are revealed with a drum roll.</p>
<h3>5. Advice and blessings wall</h3>
<p>Between rounds, guests can send a short blessing or piece of advice. The host approves each one before it appears on the big screen, and all of them go into the keepsake book at the end of the wedding.</p>` },
      { h2: 'Running it on the night', html: `
<ol>
<li><strong>Before the sangeet:</strong> create the wedding, name the two sides (they don't have to be "bride" and "groom" — "Team Sharma" and "Team Patel" works too) and pick the sangeet pack. Add a few facts about the couple and {BRAND} drafts personalised questions. Nothing goes live until you approve it.</li>
<li><strong>At the door or on the tables:</strong> put the QR code on a card or on the projector. Guests join in about twenty seconds.</li>
<li><strong>During the evening:</strong> the MC, a cousin or a co-host runs the rounds from a phone while the big-screen page runs on the venue projector or a TV. Each round takes two to four minutes.</li>
<li><strong>Before dinner:</strong> show the side-vs-side scoreboard with the animated reveal. Let the winning side do a victory lap on the dance floor.</li>
</ol>` },
      { h2: 'Poor Wi-Fi, big crowds and grandparents', html: `
<p>Banquet halls are famous for bad signal. Answers are saved on the phone first and retried automatically, so a guest who loses connection for a minute doesn't lose their points. Families can also join as one player — a grandparent and two grandchildren sharing a phone count as a family group and their vote counts for everyone in it. The guest screens can show two languages at once, so a Hindi or Punjabi line can sit under the English question.</p>` },
    ],
    faq: [
      { q: 'How many guests can play at a sangeet?', a: 'The free trial covers one event for up to {TRIAL} guests. A Wedding Pass ({WPASS}) covers three events and {PASSG} guests; Wedding Pass Plus ({WPLUS}) covers unlimited events and {PLUSG} guests.' },
      { q: 'Do guests have to download an app?', a: 'No. Guests scan a QR code and play in their browser. If they switch phones they can get back in with their 6-digit guest code.' },
      { q: 'Can the questions be in Hindi, Punjabi or Gujarati?', a: 'Yes. Wedding Pass Plus includes English, Hindi, Punjabi, Urdu, Gujarati, Tamil, Spanish and French, with an option to show two languages at once.' },
      { q: 'Do you use song lyrics?', a: 'No. The emoji round uses song titles only, never lyrics.' },
    ],
  },
  {
    slug: 'mehndi-night-games',
    emoji: '🌿',
    events: 'mehndi,haldi',
    title: 'Mehndi Night & Haldi Games — Couple Trivia, Predictions & Advice | {BRAND}',
    description: 'Relaxed mehndi and haldi games guests play on their phones while the henna dries: couple trivia, "how we met", predictions for the couple and an advice wall for the keepsake.',
    h1: 'Mehndi night games for guests with henna on their hands',
    lede: 'At a mehndi, half the room can\'t hold a pen and the other half is waiting their turn with the artist. Games that need one tap on a phone — and that keep going at their own pace — are exactly right.',
    sections: [
      { h2: 'What makes a good mehndi or haldi game', html: `
<p>The mehndi and haldi are the most relaxed events of a wedding. People drift between the henna artist, the food and the dholki, and nobody wants to be told to sit down and concentrate. The best games are short, gentle and forgiving: a question appears, you tap an answer when you can, and the scoreboard quietly keeps track. If you have wet henna on one hand, one tap with the other is enough.</p>
<p>These events are also where the two families often meet properly for the first time. Games that ask about the couple — rather than about each other — give everyone an easy topic and a reason to laugh together.</p>` },
      { h2: 'Rounds for the mehndi and haldi', html: `
<h3>Couple trivia</h3>
<p>Ten or twelve multiple-choice questions: the couple's first date, their first trip together, the dish the groom cannot cook, the bride's comfort film. Guests have 20 seconds per question, and faster correct answers earn a small bonus. Scores are kept for the whole wedding, so an early lead at the mehndi still counts at the reception.</p>
<h3>How we met</h3>
<p>The couple (or a sibling) writes a few lines about how they met and the host turns them into questions: "Where were they when they first spoke?" "Who messaged first?" It is a lovely way to tell the story without a long speech.</p>
<h3>Predictions for the couple</h3>
<p>Open prompts that guests answer in a sentence: "Where will they be on their tenth anniversary?" "Who will be the stricter parent?" "What will be their first big argument about?" The host approves the answers before any appear on the screen, and the best ones make it into the keepsake book.</p>
<h3>Advice from the elders</h3>
<p>Invite the grandparents, aunts and uncles to share a piece of marriage advice. A cousin can type it for them if typing is a struggle. These are often the notes the couple treasure most years later.</p>
<h3>Who said it?</h3>
<p>Read out a line that one of the couple actually said — a text message, a famous family quote — and guests choose who said it. Easy to play, even for the youngest cousins.</p>` },
      { h2: 'How to set it up', html: `
<ol>
<li>Create the wedding in {BRAND} and add the mehndi (and the haldi, if it is a separate event) with its date.</li>
<li>Pick the mehndi/haldi pack. It comes with ready-made rounds you can use as they are. Add facts about the couple and generate personalised questions, then read them, edit them and approve the ones you like.</li>
<li>On the day, put the QR code on a stand near the henna artist and on the projector if you have one. Guests join once and keep the same name, side and points for every event of the wedding.</li>
<li>Run a round every half hour or so. The host screen shows how many guests have answered, and a question closes itself when the timer runs out.</li>
</ol>` },
      { h2: 'Keeping it respectful', html: `
<p>Family events need gentle humour. Our built-in questions and the AI that personalises them never touch in-laws, dowry, caste, religion, weight, exes or fertility, and every AI-written question is a draft until the host approves it. Guest messages are checked automatically and held for the host if anything looks off, so nothing unexpected appears on the big screen.</p>` },
    ],
    faq: [
      { q: 'Can we use it for the haldi and the mehndi separately?', a: 'Yes. Add each as its own event. Guests join once and their points carry across every event of the wedding.' },
      { q: 'What if older relatives don\'t have smartphones?', a: 'Use family mode: one phone can play for a whole family group, and the group\'s vote counts for everyone in it.' },
      { q: 'Is it free?', a: 'The free trial runs one event for up to {TRIAL} guests. A Wedding Pass ({WPASS}) covers three events and {PASSG} guests.' },
      { q: 'Do the answers go into a keepsake?', a: 'Yes. The approved advice, predictions and wishes from every event are collected into a printable keepsake book, grouped by event and by side.' },
    ],
  },
  {
    slug: 'wedding-shoe-game-questions',
    emoji: '👟',
    events: 'reception',
    title: 'Wedding Shoe Game Questions (40 Ideas) + A Version Guests Vote On | {BRAND}',
    description: '40 wedding shoe game questions, how to run the shoe game at your reception, and a phone version where every guest votes on the answer before the couple reveals it.',
    h1: 'Wedding shoe game questions — and a version the whole room plays',
    lede: 'In the classic shoe game, the couple sit back to back, each holding one of their own shoes and one of their partner\'s, and raise the shoe that answers each question. Here is a list of questions and a way to let every guest play along.',
    sections: [
      { h2: 'How the classic shoe game works', html: `
<p>Place two chairs back to back in the middle of the dance floor. The couple take off one shoe each and swap, so each of them is holding one of their own shoes and one of their partner's. The MC reads a question — "Who is the better cook?" — and each of them raises the shoe of the person they think it is. Because they can't see each other, the fun is in the moments when they disagree.</p>
<p>It takes about ten minutes, needs no props beyond two chairs and a microphone, and works for any wedding size. The only problem is that the guests are spectators. That is where phones help.</p>` },
      { h2: 'Let guests vote first', html: `
<p>With {BRAND}, each question appears on every guest's phone and on the big screen before the couple answer. Guests vote on who they think it is, and the screen shows the room's split: 70% say the groom is the better cook. Then the couple raise their shoes and the host taps the result. Everyone who agreed with the couple gets points for themselves and their side, and when the couple disagree the host can mark it as a split.</p>
<p>It turns a ten-minute spectacle into a game for two hundred people, and the bride-side-versus-groom-side scoreboard gets one more twist before the final reveal.</p>` },
      { h2: '40 shoe game questions', html: `
<h3>Everyday life</h3>
<ul><li>Who is the better cook?</li><li>Who takes longer to get ready?</li><li>Who is the messier one?</li><li>Who wakes up first?</li><li>Who hogs the blanket?</li><li>Who is always running late?</li><li>Who controls the TV remote?</li><li>Who does the grocery shopping?</li><li>Who kills the spiders?</li><li>Who is the better driver?</li></ul>
<h3>Romance and history</h3>
<ul><li>Who made the first move?</li><li>Who said "I love you" first?</li><li>Who is more romantic?</li><li>Who remembers anniversaries?</li><li>Who fell asleep first on the first long call?</li><li>Who planned the first date?</li><li>Who cried first at the wedding?</li><li>Who is the better dancer?</li><li>Who is more likely to plan a surprise?</li><li>Who apologises first after an argument?</li></ul>
<h3>Personality</h3>
<ul><li>Who is more stubborn?</li><li>Who is the bigger foodie?</li><li>Who is the better singer?</li><li>Who talks more?</li><li>Who is more competitive at board games?</li><li>Who spends more time on their phone?</li><li>Who is the calmer one in a crisis?</li><li>Who has the better sense of direction?</li><li>Who is more likely to get lost?</li><li>Who makes friends faster?</li></ul>
<h3>The future</h3>
<ul><li>Who will be the stricter parent?</li><li>Who will want a pet first?</li><li>Who will plan the holidays?</li><li>Who will do the dishes after tonight?</li><li>Who will be the first to fall asleep at this party?</li><li>Who is more likely to take up a new hobby?</li><li>Who will be in charge of the money?</li><li>Who will pick the next holiday destination?</li><li>Who will be more nervous on the first day at a new house?</li><li>Who loves the other more? (Always save this for last.)</li></ul>` },
      { h2: 'Tips from MCs', html: `
<p>Keep it to twelve to fifteen questions — enough for a few surprises, short enough to keep the dance floor waiting. Start with easy ones, put the "who is more stubborn" type in the middle, and end with a sweet question so the couple finish facing each other. Skip anything about exes, bodies or money worries; the room includes grandparents and colleagues. If you let {BRAND} personalise the questions from a few facts, it follows the same rules and you approve every question before it goes live.</p>` },
    ],
    faq: [
      { q: 'How long does the shoe game take?', a: 'About ten minutes for 12–15 questions, a little longer if guests vote on each one first.' },
      { q: 'What happens if the couple disagree?', a: 'In the phone version, the host marks the question as a split, and the screen celebrates the disagreement. Guests who voted for either answer can still be rewarded, or you can award no points.' },
      { q: 'Can the DJ run it?', a: 'Yes. The host controls work from any phone, and a DJ/MC Pro licence ({WDJ} per year) lets a DJ run it at every wedding with their own logo on the screen.' },
      { q: 'Is there a free version?', a: 'Yes. The free trial runs one event for up to {TRIAL} guests.' },
    ],
  },
  {
    slug: 'wedding-reception-games',
    emoji: '🥂',
    events: 'reception',
    title: 'Wedding Reception Games Every Table Can Play — On Their Phones | {BRAND}',
    description: 'Wedding reception games that keep all tables involved: a guests-vote shoe game, couple trivia, a toast wall on the big screen, a side-vs-side scoreboard and an animated finale.',
    h1: 'Wedding reception games that reach the back tables',
    lede: 'Most reception games only involve the couple and the people nearest the dance floor. When the game runs on phones and a projector, table 22 plays just as hard as table 1.',
    sections: [
      { h2: 'What a reception game needs to do', html: `
<p>A reception is on a tight schedule: entrances, dinner, speeches, first dance, cake, dancing. There is room for maybe fifteen minutes of games, often between courses or just before the dance floor opens. Whatever you do in that window has to be fast to start, easy to understand from across a noisy room, and fun for guests who barely know the couple.</p>
<p>Phones are the one thing every table already has. A single QR code on each table card is all the setup the guests need. The MC or a co-host runs the rounds from their own phone, and the big-screen page runs on the venue's projector or a TV.</p>` },
      { h2: 'Reception games that work', html: `
<h3>The shoe game, with the whole room voting</h3>
<p>The couple sit back to back holding one shoe of each. Before they answer, every guest votes on their phone — "Who is the better cook?" — and the screen shows the room's opinion. Then the couple raise their shoes. Guests who agreed with the couple score points for their side. See our <a href="/wedding-shoe-game-questions">40 shoe game questions</a>.</p>
<h3>Couple trivia between courses</h3>
<p>Six to eight quick multiple-choice questions while the plates are cleared. Each question lasts 20 seconds and faster correct answers earn more points. Everyone can play, even the guest who met the groom for the first time at the ceremony, because the options make the guesses fun.</p>
<h3>The toast wall</h3>
<p>Guests who don't want to give a speech can type a short toast or wish. The host approves each one on a phone before it appears on the big screen, where the messages scroll through during dinner. Every approved toast is saved for the keepsake book.</p>
<h3>Final scoreboard and finale</h3>
<p>If you played at the mehndi, sangeet or welcome party, the reception is where it all ends. The finale screen plays a drum roll, the side bars race each other, and the winning side is revealed with confetti, followed by a podium of the top three guests across the whole wedding.</p>` },
      { h2: 'A 15-minute reception plan', html: `
<ol>
<li><strong>During dinner:</strong> the toast wall runs on the screen. The QR code is on every table card.</li>
<li><strong>After the main course (5 minutes):</strong> six trivia questions about the couple.</li>
<li><strong>Before the first dance (8 minutes):</strong> the shoe game with guest voting, 12 questions.</li>
<li><strong>Straight after (2 minutes):</strong> the finale — the winning side is announced and heads to the dance floor first.</li>
</ol>` },
      { h2: 'Big weddings and busy venues', html: `
<p>{BRAND} is built for large receptions: votes are counted on the server, so hundreds of guests can answer at the same moment. If the venue Wi-Fi drops, answers are kept on the phone and sent as soon as it comes back. Up to five co-hosts can run the rounds — a sibling from a phone, the DJ from the booth — and a guest who switches phones gets back in with their 6-digit guest code.</p>` },
    ],
    faq: [
      { q: 'How many guests can play at a reception?', a: 'A Wedding Pass ({WPASS}) covers {PASSG} guests across three events. Wedding Pass Plus ({WPLUS}) covers {PLUSG} guests and unlimited events.' },
      { q: 'Do we need a projector?', a: 'It is better with a big screen, but the game also works with just phones: every question and result appears on each guest\'s phone.' },
      { q: 'Can guest messages appear on the screen without approval?', a: 'No. Every guest message is checked automatically and must be approved by a host before it appears on the big screen or in the keepsake.' },
      { q: 'Can we keep the toasts?', a: 'Yes. The keepsake book collects approved toasts, advice and wishes from every event, grouped by event and by side, ready to print.' },
    ],
  },
  {
    slug: 'rehearsal-dinner-games',
    emoji: '🍽️',
    events: 'rehearsal,welcome',
    title: 'Rehearsal Dinner & Welcome Party Games — "How Well Do You Know the Couple?" | {BRAND}',
    description: 'Rehearsal dinner and welcome party games guests play on their phones: "how well do you know the couple?", "who said it?", icebreakers for two families and a scoreboard that carries through the wedding.',
    h1: 'Rehearsal dinner games that break the ice between two families',
    lede: 'The rehearsal dinner or welcome party is often the first time both families and the friends from every chapter of the couple\'s life share one room. A short game gives them something to talk about.',
    sections: [
      { h2: 'Why games work the night before', html: `
<p>The rehearsal dinner is smaller and calmer than the wedding, but it has its own awkwardness: the groom's college friends at one table, the bride's cousins at another, and two sets of parents making polite conversation. A quick quiz about the couple gives everyone the same topic, starts some friendly rivalry between the two sides, and produces stories that get retold at the wedding.</p>
<p>It is also the perfect warm-up. Guests join {BRAND} once at the welcome party — with their name, side and avatar — and keep the same identity and points for the rest of the wedding. By the time the reception comes round, the scoreboard already has a story.</p>` },
      { h2: 'Games for the rehearsal dinner', html: `
<h3>How well do you know the couple?</h3>
<p>Ten questions about the couple, each with four options and a 20-second timer. Mix easy ones ("Where did they get engaged?") with ones only close friends would know ("What was the first film they watched together?"). The leaderboard after each question keeps it lively.</p>
<h3>Who said it?</h3>
<p>Collect a few real quotes from each of them — texts, famous family sayings, what one of them said after the proposal — and guests decide who said each line. Quick, easy, and usually hilarious.</p>
<h3>Who is more likely to…?</h3>
<p>"…get lost on the honeymoon?" "…adopt a dog without asking?" Guests pick one of the two names and the couple's own answers are revealed on the screen.</p>
<h3>Advice and wishes</h3>
<p>Guests who travelled far or who won't get a moment at the wedding can leave a note for the couple. The host approves each one, and they are all collected into the keepsake book.</p>` },
      { h2: 'Setting it up in ten minutes', html: `
<ol>
<li>Create the wedding, name the two sides and add the rehearsal dinner or welcome party as an event.</li>
<li>Choose the rehearsal/welcome pack. Use its ready-made questions, or add facts about the couple and let {BRAND} draft personalised ones for you to approve.</li>
<li>Add the other events too — ceremony, reception, brunch — so guests can keep their points.</li>
<li>At the dinner, put the QR code on the screen or the place cards and run the quiz after the main course. The best man, the maid of honour or a sibling can run it as a co-host from their phone.</li>
</ol>` },
      { h2: 'Tips for a warm, inclusive game', html: `
<p>Keep questions about the couple rather than about any one guest, and keep it kind: nothing about exes, money, in-laws or bodies. The AI that personalises questions follows the same rules and every generated question stays a draft until you approve it. If you have guests who speak different languages, Wedding Pass Plus shows the questions in two languages side by side, including Spanish and French as well as South Asian languages.</p>` },
    ],
    faq: [
      { q: 'How long should a rehearsal dinner game be?', a: 'Ten to fifteen minutes is ideal: a ten-question quiz and a short "who said it" round.' },
      { q: 'Do the points carry over to the wedding?', a: 'Yes. Guests join the wedding once and their individual and team points carry across every event.' },
      { q: 'Can someone else run it?', a: 'Yes. The owner can add up to five co-hosts, each with a private link to run events from their phone or from the projector.' },
      { q: 'What does it cost?', a: 'The free trial covers one event for up to {TRIAL} guests. A Wedding Pass ({WPASS}) covers three events and {PASSG} guests.' },
    ],
  },
  {
    slug: 'bride-vs-groom-side-games',
    emoji: '⚔️',
    events: 'sangeet,reception',
    title: 'Bride Side vs Groom Side Games — A Friendly Wedding Rivalry | {BRAND}',
    description: 'Bride side vs groom side games with a live scoreboard across every wedding event: trivia, dance-off voting, the shoe game and an animated finale. Fair scoring for uneven sides.',
    h1: 'Bride side vs groom side: games for a friendly family rivalry',
    lede: 'Nothing gets two families laughing together faster than competing against each other. Here is how to run a side-versus-side contest across the whole wedding — fairly, even when one side is twice as big.',
    sections: [
      { h2: 'Why side-vs-side works', html: `
<p>Every wedding has two teams already. People know which side they belong to, they want their side to win, and the teasing between the families is part of the fun. Turning that into a scored game gives the whole wedding a storyline: the groom's side leads after the mehndi, the bride's side wins the dance-off at the sangeet, and it all comes down to the shoe game at the reception.</p>
<p>The sides don't have to be "bride" and "groom". Rename them to family names, "Team Toronto vs Team Delhi", or add a third side for friends of both. You can also switch to custom teams — tables, cousins versus aunties — for a single event.</p>` },
      { h2: 'Games that score by side', html: `
<h3>Couple trivia</h3>
<p>Every correct answer earns points for the player and for their side. Faster answers earn a small bonus, which gives quick-thinking cousins something to show off.</p>
<h3>Dance-off voting</h3>
<p>Each side performs, then every guest votes on their phone. Votes are tallied on the server, and the side the room chose gets a bonus. Guests can vote for their own side, but the sensible ones don't have to.</p>
<h3>Emoji songs</h3>
<p>The screen shows a song as emoji and guests pick the title. Titles only — never lyrics. It is a round where the elders and the teenagers each have an advantage on different songs.</p>
<h3>The shoe game with guest votes</h3>
<p>Guests guess which of the couple the answer will be before the couple raise their shoes. Everyone who agreed with the couple scores for their side.</p>
<h3>The finale</h3>
<p>At the end of the last event, the big screen plays a drum roll, the side bars race up, and the winning side is revealed with confetti — followed by the top three individual guests of the whole wedding.</p>` },
      { h2: 'Keeping it fair when the sides are uneven', html: `
<p>One family is often much larger than the other. If you add up everyone's points, the bigger side always wins. That is why {BRAND} scores sides by the <strong>average points per player</strong> by default, plus bonuses from votes. A side of 40 can beat a side of 120. If you prefer the "more people, more points" approach, you can switch to total points in the settings.</p>
<p>Families who share a phone can play as a family group: they count as one player for points, and their vote counts for the whole group, so grandparents are included without tipping the scores.</p>` },
      { h2: 'How to set it up', html: `
<ol>
<li>Create the wedding and name the sides. Choose their colours — they appear on every phone and on the scoreboard.</li>
<li>Add every event where you want games: mehndi, sangeet, welcome party, reception.</li>
<li>Guests choose their side when they join. The side stays with them across every event and every device.</li>
<li>Show the live side-vs-side scoreboard on the projector between rounds, and save the finale for the end of the last event.</li>
</ol>` },
    ],
    faq: [
      { q: 'Is it fair if one side has far more guests?', a: 'Yes. Sides are scored by average points per player by default, so a smaller side can win. You can switch to total points if you prefer.' },
      { q: 'Can we have more than two sides?', a: 'Yes. Rename the sides, add a third (for example, friends of both) or use custom teams.' },
      { q: 'Does the scoreboard carry across events?', a: 'Yes. Individual and team points add up across every event of the wedding, ending with the finale.' },
      { q: 'How much does it cost?', a: 'The free trial runs one event for up to {TRIAL} guests. The Wedding Pass ({WPASS}) covers three events; Wedding Pass Plus ({WPLUS}) covers unlimited events and {PLUSG} guests.' },
    ],
  },
  {
    slug: 'games-for-djs-and-mcs',
    emoji: '🎧',
    events: '',
    cta: '/dj',
    ctaLabel: 'See the DJ/MC Pro licence',
    title: 'Interactive Wedding Games for DJs and MCs — Your Logo on the Big Screen | {BRAND}',
    description: 'A white-label interactive games package for wedding DJs and MCs: guests play on their phones, you run it from the booth, your logo is on the screen. Unlimited weddings for {WDJ} a year.',
    h1: 'Interactive wedding games for DJs and MCs',
    lede: 'Add an interactive games segment to every wedding you play: guests join from their phones, you run the rounds from the booth, and your logo sits on the big screen all night.',
    sections: [
      { h2: 'Why DJs and MCs add interactive games', html: `
<p>Couples compare DJ packages on more than the playlist. An interactive segment — trivia about the couple, a shoe game the whole room votes on, a side-vs-side scoreboard with a finale — is something they can picture on the night and something guests talk about afterwards. It fills the awkward gaps between dinner and the first dance and gets tables engaged that would otherwise sit out.</p>
<p>It also works across the multi-day weddings that many DJs and MCs now cover: mehndi, sangeet, welcome party and reception, with guests keeping their points from one event to the next.</p>` },
      { h2: 'What you get with DJ/MC Pro', html: `
<ul>
<li><strong>Unlimited weddings</strong> for one yearly price ({WDJ}/year), each with unlimited events and up to {PLUSG} guests.</li>
<li><strong>Your logo and name</strong> on the projector screen and on guests' phones instead of ours.</li>
<li><strong>All the event packs:</strong> mehndi/haldi, sangeet (team trivia, dance-off voting, emoji songs using titles only), rehearsal/welcome and reception (shoe game with voting, toast wall, final scoreboard).</li>
<li><strong>Personalised questions</strong> drafted from facts the couple send you. You review and approve every question.</li>
<li><strong>Eight languages</strong> — English, Hindi, Punjabi, Urdu, Gujarati, Tamil, Spanish and French — with a two-language display for mixed families.</li>
<li><strong>A keepsake book</strong> for the couple: approved toasts and advice from every event, grouped by event and side, with the final scores, in Letter, A4 or 8×8 inch photo-book size.</li>
</ul>` },
      { h2: 'How it runs at a gig', html: `
<ol>
<li><strong>Before the wedding:</strong> create the wedding from your DJ dashboard, add the couple's events and ask the couple for a few facts about themselves. {BRAND} drafts personalised questions from them; approve the ones you want to use.</li>
<li><strong>At the venue:</strong> open the big-screen page on your laptop and send it to the projector. Put the QR code on the screen during the cocktail hour.</li>
<li><strong>During the night:</strong> run rounds from the host panel on your phone or the laptop in the booth. A question closes itself when the timer runs out, and the results appear on the screen automatically.</li>
<li><strong>After:</strong> print the keepsake book for the couple, or add them as co-hosts so they can print it themselves.</li>
</ol>
<p>You can add up to five co-hosts per wedding — an MC, a planner, a sibling of the couple — each with a private link.</p>` },
      { h2: 'Built for real venues', html: `
<p>Wedding venues have poor Wi-Fi and big crowds. Answers are saved on each phone and retried if the connection drops, and votes are counted on the server so hundreds of guests can tap at once. A guest who changes phone gets back in with a 6-digit code, no account needed. Every AI-written question is a draft until you approve it, and guest messages are moderated before anything reaches the big screen, so there are no surprises on your projector.</p>` },
      { h2: 'Pricing for couples, too', html: `
<p>If a couple wants to run the games themselves, they can buy a Wedding Pass ({WPASS}: three events, {PASSG} guests) or Wedding Pass Plus ({WPLUS}: unlimited events, {PLUSG} guests, languages and the photo-book keepsake). The DJ/MC Pro licence is for professionals who run games at many weddings a year.</p>` },
    ],
    faq: [
      { q: 'How much is the DJ/MC licence?', a: '{WDJ} per year for unlimited weddings. It renews yearly and you can cancel anytime from the billing portal.' },
      { q: 'Can I put my own logo on the screen?', a: 'Yes. Upload your logo and name once and they appear on the big screen and guests\' phones at every wedding you create.' },
      { q: 'Do guests need an app?', a: 'No. They scan a QR code and play in their browser.' },
      { q: 'Can I try it before buying?', a: 'Yes. Create a free trial wedding with one event and up to {TRIAL} guests.' },
    ],
  },
];
