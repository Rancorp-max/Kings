# King's Cup 👑

A multiplayer King's Cup party game for phones. One person hosts, everyone else joins
from their own device, picks an avatar and a name, and takes turns drawing cards.
Every draw shows up live on everyone's screen.

## How to play

1. **Host a Game**: pick your avatar and name. You get a 4-letter room code.
2. Friends tap **Share invite** / scan the **QR code**, or type the code on the home screen.
3. Each player picks an avatar, a colour and a name, then lands in the lobby.
4. The host taps **Start**. When it's your turn your screen lights up. Tap the deck to draw.
5. Cards with choices are interactive for whoever drew them:
   - **2 (You)**: pick who sips · **8 (Mate)**: pick your mate
   - **J (Categories)**: choose or type a category
   - **K (King's Cup)**: add a house rule. The 4th King ends the game.
6. Anyone can send emoji reactions, which float across every screen.

The host menu can skip a turn, remove a player, toggle Gentle mode ("sip" vs "drink")
or reshuffle. Players who refresh or drop out automatically rejoin. Offline
players are skipped after 15 seconds.

## How multiplayer works

There's no game server to run. The host's browser holds the game state, and players
connect to it peer-to-peer over WebRTC using [PeerJS](https://peerjs.com). The free
public PeerJS broker handles the initial handshake. That means:

- The site deploys as plain static files (`public/`), on Vercel, Netlify, GitHub Pages or anything else.
- **The host needs to keep the game open.** If the host closes the tab, the room ends.
  The screen is kept awake during games where the browser supports it.
- A small number of strict networks (some corporate Wi-Fi) block peer-to-peer
  connections. Switching to mobile data usually fixes it.

For local testing without a network, add `?transport=local` to the URL and open
several tabs in the same browser. Each tab acts as a separate player.

## Files

- `public/index.html`: markup for all screens
- `public/styles.css`: styles and animations
- `public/app.js`: game logic, host/guest networking, UI
- `api/ai/*`: optional serverless helpers from the previous version (currently unused by the UI)
