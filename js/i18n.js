/* i18n.js — every player-facing string, in English and Turkish.
 *
 * The page ships with English text already in the markup, so it renders
 * before this file runs. On load (and whenever the language changes) apply()
 * walks the DOM and swaps in the chosen language, then main.js repaints the
 * bits it builds in code (lobby rows, summary card, status lines).
 *
 * Markup hooks:
 *   data-i18n="key"              -> textContent
 *   data-i18n-html="key"         -> innerHTML (only strings we author ourselves)
 *   data-i18n-placeholder="key"  -> placeholder
 *   data-i18n-title="key"        -> title
 *   data-i18n-aria="key"         -> aria-label
 *
 * Missing keys fall back to English, then to the key itself, so a typo shows
 * up as readable text instead of an empty element. */
(function (global) {
  'use strict';

  var KEY = 'leapbuddies.lang.v1';
  var LANGS = ['en', 'tr'];
  var lang = 'en';

  var D = {
    en: {
      'app.title': 'Leap Buddies — a two-player co-op voxel platformer',
      'app.desc': 'Leap Buddies is a free two-player co-op platform game that runs in the browser: pick a stage, share a room code, and play together in a hand-built 3D voxel world.',
      'tagline': 'a two-player co-op platform adventure — right in your browser',

      'lang.label': 'Language',
      'lang.en': 'English',
      'lang.tr': 'Türkçe',

      'menu.youPlay': 'You play as',
      'char.redTag': 'curly hair · chain',
      'char.greenTag': 'long hair · blouse',
      'stage.label': 'Stage',
      'stage.izmir': 'İzmir',
      'stage.izmir.tag': 'sunset coast',
      'stage.nyc': 'New York',
      'stage.nyc.tag': 'midnight avenue',
      'stage.istanbul': 'İstanbul',
      'stage.istanbul.tag': 'dusk strait',
      'stage.tampa': 'Tampa',
      'stage.tampa.tag': 'sunny palms',
      'menu.onlineLabel': 'Play online with your partner',
      'menu.create': 'Create Room — then send the invite link',
      'menu.codePlaceholder': 'CODE',
      'menu.roomCodeAria': 'Room code',
      'menu.join': 'Join Room',
      'menu.deviceLabel': 'On this device',
      'menu.local': 'Local 2P — two players, one keyboard',
      'menu.solo': 'Solo — just me',

      'howto.title': 'How to play',
      'howto.sub': 'Two buddies, one screen. Get to the gold flag together.',
      'ctrl.move': 'Move',
      'ctrl.jump': 'Jump',
      'ctrl.run': 'Run · hold',
      'ctrl.runNote': 'hold it while you move',
      'ctrl.p1': 'Player 1',
      'ctrl.p2': 'Player 2',
      'tip.online': '<b>Online</b> — each player uses their own keyboard, and everyone uses the Player 1 keys.',
      'tip.pickups': 'Bump gold blocks for bananas · food restores stars or lives · three stars and three lives per run.',
      'tip.team': 'Both floor plates open the gate · stand on your buddy\'s head for a boost · pop their bubble to bring them back.',
      'tip.close': 'Stay close: fall too far behind and you are floated back to your partner in a bubble.',
      'tip.keys': '<b>M</b> mutes · a gamepad works for Player 1 · on a phone, use the touch pad under the stage.',

      'lobby.room': 'Room',
      'lobby.hint': 'Send the invite link — your partner joins straight into this room.',
      'lobby.copy': 'Copy invite link',
      'lobby.copied': 'Invite link copied — send it to your partner.',
      'lobby.character': 'Character',
      'lobby.stage': 'Stage',
      'lobby.ready': 'Ready',
      'lobby.readyDone': 'Ready ✓',
      'lobby.start': 'Start Game',
      'lobby.leave': 'Leave',
      'lobby.youHost': 'You (host)',
      'lobby.partner': 'Partner',
      'lobby.host': 'Host',
      'lobby.you': 'You',
      'badge.connected': 'connected',
      'badge.waiting': 'waiting…',
      'badge.ready': 'ready',
      'badge.notReady': 'not ready',
      'lobby.hostShare': 'Share the code or invite link with your partner.',
      'lobby.hostWaiting': 'Partner joined. Waiting for them to ready up…',
      'lobby.hostReady': 'Partner is ready — hit Start!',
      'lobby.guestIn': 'You are in. Pick your character and ready up — the host starts the game.',
      'lobby.hostLeft': 'The host left the room.',
      'lobby.pickClashHost': 'You both picked {name} — your partner will play {other}.',
      'lobby.pickClashGuest': 'Host picked {name} too — you will play {other}.',
      'lobby.stageHost': 'Both players will see this stage.',
      'lobby.stageGuest': 'The host picked {stage}.',

      'menu.3dFail': 'The 3D view could not start in this browser — try refreshing.',
      'menu.netFail': 'Netplay library failed to load — check your connection and refresh. Solo and Local 2P still work.',
      'menu.joinNoLib': 'Online play is unavailable right now — the netplay library did not load.',
      'menu.joining': 'Joining room {code}…',
      'menu.invited': 'You were invited to room {code} — pick your character, then Join Room.',
      'menu.needCode': 'Enter the 5-character room code your partner sent you.',
      'menu.joinFailed': 'Could not reach the room — check the code and try again.',
      'menu.joinStuck': 'Still trying to reach the host… If this stays stuck, the connection may be blocked — try reloading both tabs.',
      'menu.creating': 'Creating room…',
      'menu.createFail': 'Could not create a room.',

      'hud.lives': 'Lives',
      'hud.bananas': 'Bananas',
      'hud.score': 'Score',
      'hud.time': 'Time',
      'hud.leave': 'Leave',
      'hud.soundOn': 'Sound: on',
      'hud.soundOff': 'Sound: off',
      'hud.muteTitle': 'Mute (M)',
      'hud.volume': 'Volume',
      'hud.modeSolo': 'SOLO',
      'hud.modeLocal': 'LOCAL 2P',
      'hud.modeHost': 'ONLINE — HOST',
      'hud.modeGuest': 'ONLINE — GUEST',
      'hud.pause': 'Pause',
      'hud.resume': 'Resume',

      'pause.title': 'Paused',
      'pause.sub': 'The stage is holding its breath.',
      'pause.resume': 'Resume',
      'pause.leave': 'Leave',
      'pause.guest': 'Your partner paused the run.',

      'guide.open': 'Field Guide',
      'guide.title': 'Field Guide',
      'guide.sub': 'Everything the two of you can bump into: stars, bubbles, street food and the neighbours.',
      'guide.close': 'Close',
      'guide.healthTitle': 'Three stars',
      'guide.health': 'Every buddy has three stars. A critter costs you one and knocks you backwards, with a short flashing grace period.',
      'guide.healthDown': 'Lose the last star and you are down. Solo, that is one life. In co-op you become a bubble.',
      'guide.livesTitle': 'Lives and checkpoints',
      'guide.lives': 'A run starts with three lives. A fall or a team wipe costs one life and puts you back at the checkpoint: the start, or the flag at the middle of the stage.',
      'guide.bubbleTitle': 'Bubbles (two-player)',
      'guide.bubble': 'Go down in co-op and you float in a bubble where you fell. You cannot move, but your partner can pop it by touching it.',
      'guide.bubbleTeam': 'If both buddies are down at once the team loses a life and both restart together. Fall too far behind and you are carried forward in a bubble — for free.',
      'guide.foodTitle': 'Street food',
      'guide.lahmacun': 'Lahmacun — full health: all three stars back.',
      'guide.baklava': 'Baklava — one star back. Sweet and sensible.',
      'guide.ayran': 'Ayran — an extra life. Cold, salty, life-giving.',
      'guide.sujuk': 'Sujuk — ten seconds of star power: you flash gold and anything you touch is knocked out on contact.',
      'guide.foesTitle': 'Who is out there',
      'guide.dondurma': 'Dondurma Man (İzmir) — red fez, white apron, cone in hand. He stops every few steps to serve a customer, and that pause is your opening.',
      'guide.fehmi': 'Bıyıklı Fehmi (İstanbul) — fez, handlebar moustache, waistcoat, strong opinions about tea. He sips at every turn, so he always stands still for a moment before setting off again.',
      'guide.grandpa': 'Angry Grandpa (Tampa) — cardigan, cane, no interest in conversation. Get in his face and he turns and hobbles the other way.',
      'guide.hoodlum': 'Hoodlum (New York) — beanie, shades, spray can. Every few seconds he breaks into a sprint: fast, but never faster than a buddy on foot.',
      'guide.sheller': 'Green Sheller (every stage) — stomp it into a shell, then touch the shell to kick it. A sliding shell clears a whole row.',
      'guide.tipStomp': 'Jump on a head to defeat a critter. Touch one from the side and you lose a star.',
      'guide.tipGate': 'Both floor plates open the gate — stand on one each, or press them in turn.',
      'guide.tipPause': 'Esc or P pauses. M mutes. On a phone the touch pad sits under the stage.',

      'mode.solo': 'Solo',
      'mode.local': 'Local 2P',
      'mode.online': 'Online co-op',

      'summary.aria': 'Run summary',
      'summary.clear': 'STAGE CLEAR',
      'summary.over': 'GAME OVER',
      'summary.yourBest': 'Your best',
      'summary.reachedFlag': 'reached the flag',
      'summary.outOfLives': 'out of lives',
      'summary.score': 'Score',
      'summary.bananas': 'Bananas',
      'summary.time': 'Time',
      'summary.survived': 'Survived',
      'summary.lives': 'Lives',
      'summary.bestScore': 'Best score',
      'summary.bestTime': 'Best time',
      'summary.new': 'NEW',
      'summary.waitingHost': 'Waiting for the host to restart the run.',
      'summary.newTime': 'New best time — that is the run to beat.',
      'summary.newScoreClear': 'New best score. Play again to lower the time.',
      'summary.newScore': 'New best score, even without the flag.',
      'summary.playToBeat': 'Play again to beat your best.',
      'summary.target': 'Score {n} to beat your best.',
      'summary.noStorage': 'Records are unavailable — this browser blocked local storage.',
      'summary.playAgain': 'Play Again',
      'summary.backToMenu': 'Back to Menu',

      'game.outOfLives': 'Out of lives. Waiting for the host to restart.',
      'game.waitingRestart': 'Waiting for the host to restart or end the session.',
      'game.connectionLost': 'Connection to the host was lost.\nThe session has ended.',
      'game.partnerLeft': 'Partner left the room.',
      'game.partnerDisconnected': 'Your partner disconnected.\nThe session has ended.',

      'touch.aria': 'Touch controls',
      'touch.left': 'Move left',
      'touch.right': 'Move right',
      'touch.jump': 'Jump',
      'touch.run': 'Run',

      'footer': 'no accounts · no downloads · rooms are private to anyone with the code'
    },

    tr: {
      'app.title': 'Leap Buddies — iki kişilik ortak voxel platform oyunu',
      'app.desc': 'Leap Buddies tarayıcıda çalışan ücretsiz, iki kişilik ortak bir platform oyunu: bir bölüm seç, oda kodunu paylaş ve el yapımı 3B voxel dünyada birlikte oyna.',
      'tagline': 'iki kişilik ortak platform macerası — doğrudan tarayıcında',

      'lang.label': 'Dil',
      'lang.en': 'English',
      'lang.tr': 'Türkçe',

      'menu.youPlay': 'Oynadığın karakter',
      'char.redTag': 'kıvırcık saç · zincir',
      'char.greenTag': 'uzun saç · bluz',
      'stage.label': 'Bölüm',
      'stage.izmir': 'İzmir',
      'stage.izmir.tag': 'gün batımı kıyısı',
      'stage.nyc': 'New York',
      'stage.nyc.tag': 'gece bulvarı',
      'stage.istanbul': 'İstanbul',
      'stage.istanbul.tag': 'boğazda akşam',
      'stage.tampa': 'Tampa',
      'stage.tampa.tag': 'güneşli palmiyeler',
      'menu.onlineLabel': 'Ortağınla çevrimiçi oyna',
      'menu.create': 'Oda Kur — sonra davet bağlantısını gönder',
      'menu.codePlaceholder': 'KOD',
      'menu.roomCodeAria': 'Oda kodu',
      'menu.join': 'Odaya Katıl',
      'menu.deviceLabel': 'Bu cihazda',
      'menu.local': 'Yerel 2 oyuncu — iki oyuncu, tek klavye',
      'menu.solo': 'Tek kişilik — sadece ben',

      'howto.title': 'Nasıl oynanır',
      'howto.sub': 'İki arkadaş, tek ekran. Altın bayrağa birlikte ulaşın.',
      'ctrl.move': 'Hareket',
      'ctrl.jump': 'Zıpla',
      'ctrl.run': 'Koş · basılı tut',
      'ctrl.runNote': 'hareket ederken basılı tut',
      'ctrl.p1': 'Oyuncu 1',
      'ctrl.p2': 'Oyuncu 2',
      'tip.online': '<b>Çevrimiçi</b> — her oyuncu kendi klavyesini kullanır ve herkes Oyuncu 1 tuşlarıyla oynar.',
      'tip.pickups': 'Altın bloklara vurup muz topla · yiyecekler yıldız ya da can verir · her turda üç yıldız ve üç can.',
      'tip.team': 'İki yer düğmesi birlikte kapıyı açar · hız için arkadaşının kafasına bas · balonunu patlatarak onu geri getir.',
      'tip.close': 'Yakın kal: çok geride kalırsan bir balonla ortağına geri taşınırsın.',
      'tip.keys': '<b>M</b> sesi kapatır · Oyuncu 1 için gamepad çalışır · telefonda sahnenin altındaki dokunmatik tuşları kullan.',

      'lobby.room': 'Oda',
      'lobby.hint': 'Davet bağlantısını gönder — ortağın doğrudan bu odaya katılır.',
      'lobby.copy': 'Bağlantıyı kopyala',
      'lobby.copied': 'Davet bağlantısı kopyalandı — ortağına gönder.',
      'lobby.character': 'Karakter',
      'lobby.stage': 'Bölüm',
      'lobby.ready': 'Hazırım',
      'lobby.readyDone': 'Hazırım ✓',
      'lobby.start': 'Oyunu Başlat',
      'lobby.leave': 'Ayrıl',
      'lobby.youHost': 'Sen (kurucu)',
      'lobby.partner': 'Ortak',
      'lobby.host': 'Kurucu',
      'lobby.you': 'Sen',
      'badge.connected': 'bağlı',
      'badge.waiting': 'bekleniyor…',
      'badge.ready': 'hazır',
      'badge.notReady': 'hazır değil',
      'lobby.hostShare': 'Kodu ya da davet bağlantısını ortağınla paylaş.',
      'lobby.hostWaiting': 'Ortak katıldı. Hazır olması bekleniyor…',
      'lobby.hostReady': 'Ortak hazır — Başlat’a bas!',
      'lobby.guestIn': 'İçeridesin. Karakterini seç ve hazır ol — oyunu kurucu başlatır.',
      'lobby.hostLeft': 'Kurucu odadan ayrıldı.',
      'lobby.pickClashHost': 'İkiniz de {name} seçtiniz — ortağın {other} oynayacak.',
      'lobby.pickClashGuest': 'Kurucu da {name} seçti — sen {other} oynayacaksın.',
      'lobby.stageHost': 'İki oyuncu da bu bölümü görür.',
      'lobby.stageGuest': 'Kurucu {stage} bölümünü seçti.',

      'menu.3dFail': 'Bu tarayıcıda 3B görünüm başlatılamadı — sayfayı yenilemeyi dene.',
      'menu.netFail': 'Ağ kütüphanesi yüklenemedi — bağlantını kontrol edip sayfayı yenile. Tek kişilik ve yerel 2 oyuncu hâlâ çalışır.',
      'menu.joinNoLib': 'Çevrimiçi oyun şu an kullanılamıyor — ağ kütüphanesi yüklenmedi.',
      'menu.joining': '{code} odasına katılıyorsun…',
      'menu.invited': '{code} odasına davet edildin — karakterini seç, sonra Odaya Katıl.',
      'menu.needCode': 'Ortağının gönderdiği 5 karakterlik oda kodunu gir.',
      'menu.joinFailed': 'Odaya ulaşılamadı — kodu kontrol edip tekrar dene.',
      'menu.joinStuck': 'Kurucuya hâlâ ulaşmaya çalışıyorum… Böyle kalırsa bağlantı engellenmiş olabilir — iki sekmeyi de yenilemeyi dene.',
      'menu.creating': 'Oda kuruluyor…',
      'menu.createFail': 'Oda kurulamadı.',

      'hud.lives': 'Can',
      'hud.bananas': 'Muz',
      'hud.score': 'Puan',
      'hud.time': 'Süre',
      'hud.leave': 'Çık',
      'hud.soundOn': 'Ses: açık',
      'hud.soundOff': 'Ses: kapalı',
      'hud.muteTitle': 'Sesi kapat (M)',
      'hud.volume': 'Ses düzeyi',
      'hud.modeSolo': 'TEK KİŞİLİK',
      'hud.modeLocal': 'YEREL 2 OYUNCU',
      'hud.modeHost': 'ÇEVRİMİÇİ — KURUCU',
      'hud.modeGuest': 'ÇEVRİMİÇİ — MİSAFİR',
      'hud.pause': 'Duraklat',
      'hud.resume': 'Devam',

      'pause.title': 'Duraklatıldı',
      'pause.sub': 'Sahne nefesini tutuyor.',
      'pause.resume': 'Devam et',
      'pause.leave': 'Ayrıl',
      'pause.guest': 'Ortağın turu duraklattı.',

      'guide.open': 'Saha Rehberi',
      'guide.title': 'Saha Rehberi',
      'guide.sub': 'İkinizin karşılaşabileceği her şey: yıldızlar, balonlar, sokak lezzetleri ve komşular.',
      'guide.close': 'Kapat',
      'guide.healthTitle': 'Üç yıldız',
      'guide.health': 'Her arkadaşın üç yıldızı var. Bir yaratık bir yıldızı alır ve seni geri iter; kısa bir yanıp sönen dokunulmazlık süresi başlar.',
      'guide.healthDown': 'Son yıldızı da kaybedersen yere düşersin. Tek kişilikte bu bir can demek. Ortak oyunda balona dönüşürsün.',
      'guide.livesTitle': 'Canlar ve kontrol noktaları',
      'guide.lives': 'Tur üç canla başlar. Düşmek ya da iki oyuncunun birden yenilmesi bir can götürür ve seni kontrol noktasına koyar: başlangıç ya da bölümün ortasındaki bayrak.',
      'guide.bubbleTitle': 'Balonlar (iki oyuncu)',
      'guide.bubble': 'Ortak oyunda yenilirsen düştüğün yerde bir balonun içinde süzülürsün. Hareket edemezsin ama ortağın dokunarak balonu patlatabilir.',
      'guide.bubbleTeam': 'İki arkadaş aynı anda yenilirse takım bir can kaybeder ve ikiniz birlikte yeniden başlarsınız. Çok geride kalırsan aynı balonla bedavaya öne taşınırsın.',
      'guide.foodTitle': 'Sokak lezzetleri',
      'guide.lahmacun': 'Lahmacun — tam can: üç yıldızın hepsi geri gelir.',
      'guide.baklava': 'Baklava — bir yıldız geri gelir. Tatlı ve mantıklı.',
      'guide.ayran': 'Ayran — fazladan bir can. Soğuk, tuzlu, hayat veren.',
      'guide.sujuk': 'Sucuk — on saniyelik yıldız gücü: altın gibi parlarsın ve dokunduğun her şey anında nakavt olur.',
      'guide.foesTitle': 'Dışarıda kim var',
      'guide.dondurma': 'Dondurmacı (İzmir) — kırmızı fes, beyaz önlük, elinde külah. Birkaç adımda bir durup müşteriye dondurma verir; o duraklama senin fırsatın.',
      'guide.fehmi': 'Bıyıklı Fehmi (İstanbul) — fes, pala bıyık, yelek, çay hakkında kesin fikirler. Her dönüşte çayını yudumlar, yani yeniden yola koyulmadan önce hep bir an durur.',
      'guide.grandpa': 'Huysuz Dede (Tampa) — hırka, baston, sohbete hiç niyeti yok. Burnunun dibine girersen döner ve topallayarak öbür yöne gider.',
      'guide.hoodlum': 'Serseri (New York) — bere, güneş gözlüğü, sprey kutusu. Birkaç saniyede bir depar atar: hızlıdır ama yürüyen bir arkadaştan asla hızlı değildir.',
      'guide.sheller': 'Yeşil Kabuklu (her bölüm) — kafasına basıp kabuğa çevir, sonra kabuğa dokunup tekmele. Kayan kabuk bütün bir sırayı temizler.',
      'guide.tipStomp': 'Bir yaratığı yenmek için kafasına zıpla. Yandan dokunursan bir yıldız kaybedersin.',
      'guide.tipGate': 'İki yer düğmesi kapıyı açar — birer birer bas ya da sırayla.',
      'guide.tipPause': 'Esc veya P duraklatır. M sesi kapatır. Telefonda dokunmatik tuşlar sahnenin altındadır.',

      'mode.solo': 'Tek kişilik',
      'mode.local': 'Yerel 2 oyuncu',
      'mode.online': 'Çevrimiçi ortak',

      'summary.aria': 'Tur özeti',
      'summary.clear': 'BÖLÜM TAMAM',
      'summary.over': 'OYUN BİTTİ',
      'summary.yourBest': 'En iyin',
      'summary.reachedFlag': 'bayrağa ulaştı',
      'summary.outOfLives': 'canlar bitti',
      'summary.score': 'Puan',
      'summary.bananas': 'Muz',
      'summary.time': 'Süre',
      'summary.survived': 'Dayanılan',
      'summary.lives': 'Can',
      'summary.bestScore': 'En iyi puan',
      'summary.bestTime': 'En iyi süre',
      'summary.new': 'YENİ',
      'summary.waitingHost': 'Kurucunun turu yeniden başlatması bekleniyor.',
      'summary.newTime': 'Yeni en iyi süre — geçilmesi gereken tur bu.',
      'summary.newScoreClear': 'Yeni en iyi puan. Süreyi düşürmek için tekrar oyna.',
      'summary.newScore': 'Bayrağa ulaşmadan bile yeni en iyi puan.',
      'summary.playToBeat': 'En iyini geçmek için tekrar oyna.',
      'summary.target': 'En iyini geçmek için {n} puan yap.',
      'summary.noStorage': 'Kayıtlar kullanılamıyor — bu tarayıcı yerel depolamayı engelledi.',
      'summary.playAgain': 'Tekrar Oyna',
      'summary.backToMenu': 'Menüye Dön',

      'game.outOfLives': 'Canlar bitti. Kurucunun yeniden başlatması bekleniyor.',
      'game.waitingRestart': 'Kurucunun turu yeniden başlatması ya da oturumu bitirmesi bekleniyor.',
      'game.connectionLost': 'Kurucu ile bağlantı koptu.\nOturum sona erdi.',
      'game.partnerLeft': 'Ortak odadan ayrıldı.',
      'game.partnerDisconnected': 'Ortağının bağlantısı koptu.\nOturum sona erdi.',

      'touch.aria': 'Dokunmatik kontroller',
      'touch.left': 'Sola git',
      'touch.right': 'Sağa git',
      'touch.jump': 'Zıpla',
      'touch.run': 'Koş',

      'footer': 'hesap yok · indirme yok · odalar kodu bilen herkese özel'
    }
  };

  function store() {
    try {
      var s = global.localStorage;
      if (s && typeof s.getItem === 'function') return s;
    } catch (e) { /* blocked */ }
    return null;
  }

  function read() {
    var s = store();
    var v = null;
    if (s) { try { v = s.getItem(KEY); } catch (e) { v = null; } }
    if (LANGS.indexOf(v) < 0) {
      /* first visit: follow the browser, Turkish speakers get Turkish */
      try {
        var nav = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || 'en';
        v = /^tr\b/i.test(nav) ? 'tr' : 'en';
      } catch (e) { v = 'en'; }
    }
    return v;
  }

  function save(v) {
    var s = store();
    if (!s) return;
    try { s.setItem(KEY, v); } catch (e) { /* quota */ }
  }

  function t(key, vars) {
    var table = D[lang] || D.en;
    var s = table[key];
    if (s == null) s = D.en[key];
    if (s == null) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] == null ? m : String(vars[name]);
      });
    }
    return s;
  }

  function apply() {
    if (typeof document === 'undefined') return 0;
    var n = 0;
    var els = document.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-placeholder],[data-i18n-title],[data-i18n-aria]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], k;
      if ((k = el.getAttribute('data-i18n')) != null) el.textContent = t(k);
      if ((k = el.getAttribute('data-i18n-html')) != null) el.innerHTML = t(k);
      if ((k = el.getAttribute('data-i18n-placeholder')) != null) el.placeholder = t(k);
      if ((k = el.getAttribute('data-i18n-title')) != null) el.title = t(k);
      if ((k = el.getAttribute('data-i18n-aria')) != null) el.setAttribute('aria-label', t(k));
      n++;
    }
    document.documentElement.lang = lang;
    if (document.title) document.title = t('app.title');
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('app.desc'));
    var buttons = document.querySelectorAll('[data-lang]');
    for (var b = 0; b < buttons.length; b++) {
      var on = buttons[b].getAttribute('data-lang') === lang;
      buttons[b].classList.toggle('on', on);
      buttons[b].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    return n;
  }

  function setLang(next) {
    if (LANGS.indexOf(next) < 0 || next === lang) {
      /* still apply: the first call after load must paint the markup */
      apply();
      return lang;
    }
    lang = next;
    save(lang);
    apply();
    return lang;
  }

  function stageName(id) {
    var k = 'stage.' + id;
    var v = t(k);
    return v === k ? id : v;
  }
  function stageTag(id) {
    var k = 'stage.' + id + '.tag';
    var v = t(k);
    return v === k ? '' : v;
  }
  function modeName(role) {
    if (role === 'local') return t('mode.local');
    if (role === 'host' || role === 'guest') return t('mode.online');
    return t('mode.solo');
  }
  function modeHud(role) {
    if (role === 'local') return t('hud.modeLocal');
    if (role === 'host') return t('hud.modeHost');
    if (role === 'guest') return t('hud.modeGuest');
    return t('hud.modeSolo');
  }

  lang = read();
  global.I18n = {
    key: KEY,
    langs: LANGS,
    t: t,
    apply: apply,
    setLang: setLang,
    get lang() { return lang; },
    stageName: stageName,
    stageTag: stageTag,
    modeName: modeName,
    modeHud: modeHud,
    /* exposed for the headless tests */
    dict: D
  };
})(typeof window !== 'undefined' ? window : globalThis);
