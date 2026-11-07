# Playing Spelling Mayhem on an iPad

There are two ways. **Option 1 is the simplest and needs no Mac.**

## Option 1: Web browser, then "Add to Home Screen" (recommended)

The game has to be on a website, because an iPad can't open a game from a Windows folder.

1. Put the whole `word-blaster` folder on any static web host that uses **https**, for example:
   - **Netlify Drop** (https://app.netlify.com/drop): drag the `word-blaster` folder onto the page. You get a link in about a minute.
   - **GitHub Pages**: upload the folder to a repository and turn on Pages.
   - Your school or university web space.
   (You can leave out `ipad-app`, `build_voice.py` and `extract_words.py`; the game doesn't need them.)
2. On the iPad, open the link in **Safari** and play right away.
3. To make it a standalone app: tap **Share** (□↑), then **Add to Home Screen**. It gets its own icon,
   opens full screen with no Safari bars, and keeps working **offline** after the first run.
   Each word's voice clip is saved the first time it plays.

Tips:
- If you hear no sound, check the iPad's silent switch / Control Center mute, and turn up the volume.
- A Bluetooth or Magic Keyboard also works. Otherwise use the on-screen letter keys.
- After changing game files, raise `VERSION` in `sw.js` so installed copies pick up the update.

## Option 2: A real App Store / TestFlight app (needs a Mac)

The `ipad-app` folder wraps the same game in a native iOS app with [Capacitor](https://capacitorjs.com).
Everything, including the 32 MB of voice clips, is built into the app, so it works fully offline.

Requirements: a Mac with Xcode, Node.js 18 or newer, and an Apple Developer account
($99/year; needed to install on an iPad beyond 7-day test builds, and to publish).

```sh
cd word-blaster/ipad-app
# First, change "appId" in capacitor.config.json to your own, e.g. edu.upenn.yourname.spellingmayhem
npm install
npm run setup      # copies the game in and creates the Xcode project (ios/)
npm run open       # opens Xcode
```

In Xcode: select the **App** target, then **Signing & Capabilities**, and choose your team. Under **General**,
set the device to iPad and add an app icon (`../icons/icon-512.png` is a starting point; Xcode wants 1024×1024).
Plug in the iPad and press ▶ to run it, or use **Product → Archive** to send it to TestFlight or the App Store.

After you change the game, run `npm run sync` and rebuild in Xcode.
