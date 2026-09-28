// Guest-facing UI strings for weddings. English is the source; the others are
// first drafts to be reviewed by native speakers before launch.
import { SITE } from '../site-config.js';

const EN = {
  join_title: 'Join the wedding games', your_name: 'Your name', pick_side: 'Whose side are you on?', pick_avatar: 'Pick your avatar',
  group_mode: 'Answering for a family or group on one phone?', group_size: 'How many people?', join_btn: 'Join the fun',
  have_code: 'Already joined on another phone?', guest_code: 'Your 6-digit guest code', resume_btn: 'Continue', wedding_code: 'Wedding code',
  your_code_is: 'Your guest code (use it to continue on another phone):', waiting: 'Waiting for the next game…', locked: 'Locked in! Waiting for everyone…',
  correct: 'Correct!', wrong: 'Not quite — it was', split: "They disagreed! No points this time.", too_slow: "Time's up!", points: 'points', rank: 'Rank', your_team: 'Your team',
  vote_title: 'Vote!', voted: 'Vote counted!', write_note: 'Leave a wish for the couple', note_placeholder: 'Write something kind…', send: 'Send',
  note_sent: 'Sent — thank you!', note_pending: 'Thanks! A host will check it before it goes on the big screen.', leaderboard: 'Leaderboard',
  sides_score: 'Side vs side', finale: 'And the winning side is…', offline: "You're offline — your answer will be sent when you reconnect.",
  shoe_title: 'Who is it? Vote!', guess_song: 'Guess the song!', language: 'Language', thanks: 'Thank you for playing!', prompt_title: 'Share with the couple',
  now_playing: 'Now playing', playing_as: "You're playing as", scan_to_join: 'Scan to join', or_visit: 'or visit', enter_code: 'and enter the code',
  kind_advice: 'Advice', kind_wish: 'Wish', kind_prediction: 'Prediction', kind_toast: 'Toast', kind_story: 'Story', guests: 'guests', answered: 'answered',
};

const T = {
  en: EN,
  hi: {
    join_title: 'शादी के खेलों में शामिल हों', your_name: 'आपका नाम', pick_side: 'आप किसकी तरफ़ से हैं?', pick_avatar: 'अपना अवतार चुनें',
    group_mode: 'एक फ़ोन से पूरे परिवार या समूह के लिए जवाब दे रहे हैं?', group_size: 'कितने लोग?', join_btn: 'खेल में शामिल हों',
    have_code: 'दूसरे फ़ोन पर पहले से जुड़े हैं?', guest_code: 'आपका 6 अंकों का अतिथि कोड', resume_btn: 'जारी रखें', wedding_code: 'शादी का कोड',
    your_code_is: 'आपका अतिथि कोड (दूसरे फ़ोन पर जारी रखने के लिए):', waiting: 'अगले खेल का इंतज़ार…', locked: 'जवाब दर्ज! सबका इंतज़ार…',
    correct: 'सही जवाब!', wrong: 'नहीं — सही जवाब था', split: "दोनों की राय अलग निकली! इस बार कोई अंक नहीं।", too_slow: 'समय खत्म!', points: 'अंक', rank: 'स्थान', your_team: 'आपकी टीम',
    vote_title: 'वोट करें!', voted: 'वोट गिन लिया गया!', write_note: 'जोड़े के लिए शुभकामना लिखें', note_placeholder: 'कुछ प्यारा लिखें…', send: 'भेजें',
    note_sent: 'भेज दिया — धन्यवाद!', note_pending: 'धन्यवाद! बड़ी स्क्रीन पर दिखाने से पहले मेज़बान इसे देखेंगे।', leaderboard: 'अंक तालिका',
    sides_score: 'पक्ष बनाम पक्ष', finale: 'और जीतने वाला पक्ष है…', offline: 'आप ऑफ़लाइन हैं — जुड़ते ही आपका जवाब भेज दिया जाएगा।',
    shoe_title: 'कौन है? वोट करें!', guess_song: 'गाना पहचानें!', language: 'भाषा', thanks: 'खेलने के लिए धन्यवाद!', prompt_title: 'जोड़े के साथ साझा करें',
    now_playing: 'अभी चल रहा है', playing_as: 'आप खेल रहे हैं', scan_to_join: 'जुड़ने के लिए स्कैन करें', or_visit: 'या जाएँ', enter_code: 'और कोड डालें',
    kind_advice: 'सलाह', kind_wish: 'शुभकामना', kind_prediction: 'भविष्यवाणी', kind_toast: 'टोस्ट', kind_story: 'कहानी', guests: 'मेहमान', answered: 'ने जवाब दिया',
  },
  pa: {
    join_title: 'ਵਿਆਹ ਦੀਆਂ ਖੇਡਾਂ ਵਿੱਚ ਸ਼ਾਮਲ ਹੋਵੋ', your_name: 'ਤੁਹਾਡਾ ਨਾਮ', pick_side: 'ਤੁਸੀਂ ਕਿਸ ਦੀ ਤਰਫ਼ੋਂ ਹੋ?', pick_avatar: 'ਆਪਣਾ ਅਵਤਾਰ ਚੁਣੋ',
    group_mode: 'ਇੱਕ ਫ਼ੋਨ ਤੋਂ ਪੂਰੇ ਪਰਿਵਾਰ ਜਾਂ ਟੋਲੀ ਲਈ ਜਵਾਬ ਦੇ ਰਹੇ ਹੋ?', group_size: 'ਕਿੰਨੇ ਲੋਕ?', join_btn: 'ਖੇਡ ਵਿੱਚ ਸ਼ਾਮਲ ਹੋਵੋ',
    have_code: 'ਕਿਸੇ ਹੋਰ ਫ਼ੋਨ ਤੇ ਪਹਿਲਾਂ ਹੀ ਜੁੜੇ ਹੋ?', guest_code: 'ਤੁਹਾਡਾ 6 ਅੰਕਾਂ ਦਾ ਮਹਿਮਾਨ ਕੋਡ', resume_btn: 'ਜਾਰੀ ਰੱਖੋ', wedding_code: 'ਵਿਆਹ ਦਾ ਕੋਡ',
    your_code_is: 'ਤੁਹਾਡਾ ਮਹਿਮਾਨ ਕੋਡ (ਹੋਰ ਫ਼ੋਨ ਤੇ ਜਾਰੀ ਰੱਖਣ ਲਈ):', waiting: 'ਅਗਲੀ ਖੇਡ ਦੀ ਉਡੀਕ…', locked: 'ਜਵਾਬ ਦਰਜ! ਸਾਰਿਆਂ ਦੀ ਉਡੀਕ…',
    correct: 'ਸਹੀ ਜਵਾਬ!', wrong: 'ਨਹੀਂ — ਸਹੀ ਜਵਾਬ ਸੀ', split: "ਦੋਵਾਂ ਦੀ ਰਾਏ ਵੱਖਰੀ ਨਿਕਲੀ! ਇਸ ਵਾਰ ਕੋਈ ਅੰਕ ਨਹੀਂ।", too_slow: 'ਸਮਾਂ ਖ਼ਤਮ!', points: 'ਅੰਕ', rank: 'ਸਥਾਨ', your_team: 'ਤੁਹਾਡੀ ਟੀਮ',
    vote_title: 'ਵੋਟ ਪਾਓ!', voted: 'ਵੋਟ ਗਿਣੀ ਗਈ!', write_note: 'ਜੋੜੀ ਲਈ ਸ਼ੁਭਕਾਮਨਾ ਲਿਖੋ', note_placeholder: 'ਕੁਝ ਪਿਆਰਾ ਲਿਖੋ…', send: 'ਭੇਜੋ',
    note_sent: 'ਭੇਜ ਦਿੱਤਾ — ਧੰਨਵਾਦ!', note_pending: 'ਧੰਨਵਾਦ! ਵੱਡੀ ਸਕਰੀਨ ਤੇ ਆਉਣ ਤੋਂ ਪਹਿਲਾਂ ਮੇਜ਼ਬਾਨ ਇਸਨੂੰ ਵੇਖਣਗੇ।', leaderboard: 'ਅੰਕ ਸੂਚੀ',
    sides_score: 'ਪੱਖ ਬਨਾਮ ਪੱਖ', finale: 'ਅਤੇ ਜਿੱਤਣ ਵਾਲਾ ਪੱਖ ਹੈ…', offline: 'ਤੁਸੀਂ ਔਫਲਾਈਨ ਹੋ — ਜੁੜਦੇ ਹੀ ਤੁਹਾਡਾ ਜਵਾਬ ਭੇਜ ਦਿੱਤਾ ਜਾਵੇਗਾ।',
    shoe_title: 'ਕੌਣ ਹੈ? ਵੋਟ ਪਾਓ!', guess_song: 'ਗੀਤ ਪਛਾਣੋ!', language: 'ਭਾਸ਼ਾ', thanks: 'ਖੇਡਣ ਲਈ ਧੰਨਵਾਦ!', prompt_title: 'ਜੋੜੀ ਨਾਲ ਸਾਂਝਾ ਕਰੋ',
    now_playing: 'ਹੁਣ ਚੱਲ ਰਿਹਾ ਹੈ', playing_as: 'ਤੁਸੀਂ ਖੇਡ ਰਹੇ ਹੋ', scan_to_join: 'ਜੁੜਨ ਲਈ ਸਕੈਨ ਕਰੋ', or_visit: 'ਜਾਂ ਜਾਓ', enter_code: 'ਅਤੇ ਕੋਡ ਭਰੋ',
    kind_advice: 'ਸਲਾਹ', kind_wish: 'ਸ਼ੁਭਕਾਮਨਾ', kind_prediction: 'ਭਵਿੱਖਬਾਣੀ', kind_toast: 'ਟੋਸਟ', kind_story: 'ਕਹਾਣੀ', guests: 'ਮਹਿਮਾਨ', answered: 'ਨੇ ਜਵਾਬ ਦਿੱਤਾ',
  },
  ur: {
    join_title: 'شادی کے کھیلوں میں شامل ہوں', your_name: 'آپ کا نام', pick_side: 'آپ کس کی طرف سے ہیں؟', pick_avatar: 'اپنا اوتار چنیں',
    group_mode: 'ایک فون سے پورے خاندان یا گروپ کے لیے جواب دے رہے ہیں؟', group_size: 'کتنے لوگ؟', join_btn: 'کھیل میں شامل ہوں',
    have_code: 'کسی اور فون پر پہلے سے شامل ہیں؟', guest_code: 'آپ کا 6 ہندسوں کا مہمان کوڈ', resume_btn: 'جاری رکھیں', wedding_code: 'شادی کا کوڈ',
    your_code_is: 'آپ کا مہمان کوڈ (دوسرے فون پر جاری رکھنے کے لیے):', waiting: 'اگلے کھیل کا انتظار…', locked: 'جواب درج! سب کا انتظار…',
    correct: 'درست جواب!', wrong: 'نہیں — درست جواب تھا', split: "دونوں کی رائے مختلف نکلی! اس بار کوئی پوائنٹس نہیں۔", too_slow: 'وقت ختم!', points: 'پوائنٹس', rank: 'درجہ', your_team: 'آپ کی ٹیم',
    vote_title: 'ووٹ دیں!', voted: 'ووٹ شمار ہو گیا!', write_note: 'جوڑے کے لیے نیک خواہش لکھیں', note_placeholder: 'کچھ پیارا لکھیں…', send: 'بھیجیں',
    note_sent: 'بھیج دیا — شکریہ!', note_pending: 'شکریہ! بڑی اسکرین پر دکھانے سے پہلے میزبان اسے دیکھیں گے۔', leaderboard: 'پوائنٹس ٹیبل',
    sides_score: 'فریق بمقابلہ فریق', finale: 'اور جیتنے والا فریق ہے…', offline: 'آپ آف لائن ہیں — رابطہ بحال ہوتے ہی آپ کا جواب بھیج دیا جائے گا۔',
    shoe_title: 'کون ہے؟ ووٹ دیں!', guess_song: 'گانا پہچانیں!', language: 'زبان', thanks: 'کھیلنے کا شکریہ!', prompt_title: 'جوڑے کے ساتھ بانٹیں',
    now_playing: 'ابھی جاری ہے', playing_as: 'آپ کھیل رہے ہیں بطور', scan_to_join: 'شامل ہونے کے لیے اسکین کریں', or_visit: 'یا جائیں', enter_code: 'اور کوڈ درج کریں',
    kind_advice: 'مشورہ', kind_wish: 'نیک خواہش', kind_prediction: 'پیشگوئی', kind_toast: 'ٹوسٹ', kind_story: 'کہانی', guests: 'مہمان', answered: 'نے جواب دیا',
  },
  gu: {
    join_title: 'લગ્નની રમતોમાં જોડાઓ', your_name: 'તમારું નામ', pick_side: 'તમે કોના પક્ષે છો?', pick_avatar: 'તમારો અવતાર પસંદ કરો',
    group_mode: 'એક ફોનથી આખા પરિવાર કે જૂથ માટે જવાબ આપો છો?', group_size: 'કેટલા લોકો?', join_btn: 'રમતમાં જોડાઓ',
    have_code: 'બીજા ફોન પર પહેલેથી જોડાયેલા છો?', guest_code: 'તમારો 6 અંકનો મહેમાન કોડ', resume_btn: 'ચાલુ રાખો', wedding_code: 'લગ્નનો કોડ',
    your_code_is: 'તમારો મહેમાન કોડ (બીજા ફોન પર ચાલુ રાખવા માટે):', waiting: 'આગલી રમતની રાહ…', locked: 'જવાબ નોંધાયો! બધાની રાહ…',
    correct: 'સાચો જવાબ!', wrong: 'ના — સાચો જવાબ હતો', split: "બંનેના જવાબ અલગ નીકળ્યા! આ વખતે કોઈ પોઈન્ટ નહીં.", too_slow: 'સમય પૂરો!', points: 'પોઈન્ટ', rank: 'ક્રમ', your_team: 'તમારી ટીમ',
    vote_title: 'મત આપો!', voted: 'મત ગણાયો!', write_note: 'દંપતી માટે શુભેચ્છા લખો', note_placeholder: 'કંઈક પ્રેમાળ લખો…', send: 'મોકલો',
    note_sent: 'મોકલ્યું — આભાર!', note_pending: 'આભાર! મોટી સ્ક્રીન પર બતાવતા પહેલાં યજમાન તેને જોશે.', leaderboard: 'પોઈન્ટ ટેબલ',
    sides_score: 'પક્ષ વિરુદ્ધ પક્ષ', finale: 'અને વિજેતા પક્ષ છે…', offline: 'તમે ઑફલાઇન છો — જોડાતાં જ તમારો જવાબ મોકલાશે.',
    shoe_title: 'કોણ છે? મત આપો!', guess_song: 'ગીત ઓળખો!', language: 'ભાષા', thanks: 'રમવા બદલ આભાર!', prompt_title: 'દંપતી સાથે વહેંચો',
    now_playing: 'હવે ચાલી રહ્યું છે', playing_as: 'તમે રમી રહ્યા છો', scan_to_join: 'જોડાવા માટે સ્કેન કરો', or_visit: 'અથવા જાઓ', enter_code: 'અને કોડ દાખલ કરો',
    kind_advice: 'સલાહ', kind_wish: 'શુભેચ્છા', kind_prediction: 'આગાહી', kind_toast: 'ટોસ્ટ', kind_story: 'વાર્તા', guests: 'મહેમાન', answered: 'એ જવાબ આપ્યો',
  },
  ta: {
    join_title: 'திருமண விளையாட்டுகளில் சேருங்கள்', your_name: 'உங்கள் பெயர்', pick_side: 'நீங்கள் யாருடைய பக்கம்?', pick_avatar: 'உங்கள் அவதாரத்தைத் தேர்ந்தெடுக்கவும்',
    group_mode: 'ஒரு கைபேசியில் குடும்பம் அல்லது குழுவுக்காக பதில் அளிக்கிறீர்களா?', group_size: 'எத்தனை பேர்?', join_btn: 'விளையாட்டில் சேருங்கள்',
    have_code: 'வேறு கைபேசியில் ஏற்கனவே சேர்ந்துவிட்டீர்களா?', guest_code: 'உங்கள் 6 இலக்க விருந்தினர் குறியீடு', resume_btn: 'தொடரவும்', wedding_code: 'திருமணக் குறியீடு',
    your_code_is: 'உங்கள் விருந்தினர் குறியீடு (வேறு கைபேசியில் தொடர):', waiting: 'அடுத்த விளையாட்டுக்காகக் காத்திருக்கிறோம்…', locked: 'பதில் பதிவானது! அனைவருக்காகக் காத்திருக்கிறோம்…',
    correct: 'சரியான பதில்!', wrong: 'இல்லை — சரியான பதில்', split: "இருவரின் பதிலும் வேறுபட்டது! இம்முறை புள்ளிகள் இல்லை.", too_slow: 'நேரம் முடிந்தது!', points: 'புள்ளிகள்', rank: 'நிலை', your_team: 'உங்கள் அணி',
    vote_title: 'வாக்களியுங்கள்!', voted: 'வாக்கு எண்ணப்பட்டது!', write_note: 'தம்பதிக்கு வாழ்த்து எழுதுங்கள்', note_placeholder: 'அன்பாக ஏதாவது எழுதுங்கள்…', send: 'அனுப்பு',
    note_sent: 'அனுப்பப்பட்டது — நன்றி!', note_pending: 'நன்றி! பெரிய திரையில் காட்டும் முன் விருந்தோம்பாளர் இதைப் பார்ப்பார்.', leaderboard: 'புள்ளிப் பட்டியல்',
    sides_score: 'பக்கம் எதிர் பக்கம்', finale: 'வெற்றி பெற்ற பக்கம்…', offline: 'நீங்கள் இணைப்பில் இல்லை — இணைந்ததும் உங்கள் பதில் அனுப்பப்படும்.',
    shoe_title: 'யார் அது? வாக்களியுங்கள்!', guess_song: 'பாடலைக் கண்டுபிடியுங்கள்!', language: 'மொழி', thanks: 'விளையாடியதற்கு நன்றி!', prompt_title: 'தம்பதியுடன் பகிருங்கள்',
    now_playing: 'இப்போது நடக்கிறது', playing_as: 'நீங்கள் விளையாடுவது', scan_to_join: 'சேர ஸ்கேன் செய்யுங்கள்', or_visit: 'அல்லது செல்லுங்கள்', enter_code: 'குறியீட்டை உள்ளிடுங்கள்',
    kind_advice: 'அறிவுரை', kind_wish: 'வாழ்த்து', kind_prediction: 'கணிப்பு', kind_toast: 'வாழ்த்துரை', kind_story: 'கதை', guests: 'விருந்தினர்கள்', answered: 'பதிலளித்தனர்',
  },
  es: {
    join_title: 'Únete a los juegos de la boda', your_name: 'Tu nombre', pick_side: '¿De qué lado estás?', pick_avatar: 'Elige tu avatar',
    group_mode: '¿Respondes por una familia o grupo desde un solo teléfono?', group_size: '¿Cuántas personas?', join_btn: 'Unirme a la diversión',
    have_code: '¿Ya te uniste desde otro teléfono?', guest_code: 'Tu código de invitado de 6 dígitos', resume_btn: 'Continuar', wedding_code: 'Código de la boda',
    your_code_is: 'Tu código de invitado (para continuar en otro teléfono):', waiting: 'Esperando el próximo juego…', locked: '¡Respuesta enviada! Esperando a todos…',
    correct: '¡Correcto!', wrong: 'Casi — era', split: "¡No coincidieron! Esta vez no hay puntos.", too_slow: '¡Se acabó el tiempo!', points: 'puntos', rank: 'Puesto', your_team: 'Tu equipo',
    vote_title: '¡Vota!', voted: '¡Voto contado!', write_note: 'Deja un deseo para la pareja', note_placeholder: 'Escribe algo bonito…', send: 'Enviar',
    note_sent: '¡Enviado, gracias!', note_pending: '¡Gracias! Un anfitrión lo revisará antes de mostrarlo en la pantalla grande.', leaderboard: 'Clasificación',
    sides_score: 'Lado contra lado', finale: 'Y el lado ganador es…', offline: 'Estás sin conexión: tu respuesta se enviará al reconectar.',
    shoe_title: '¿Quién es? ¡Vota!', guess_song: '¡Adivina la canción!', language: 'Idioma', thanks: '¡Gracias por jugar!', prompt_title: 'Comparte con la pareja',
    now_playing: 'Ahora', playing_as: 'Juegas como', scan_to_join: 'Escanea para unirte', or_visit: 'o visita', enter_code: 'e introduce el código',
    kind_advice: 'Consejo', kind_wish: 'Deseo', kind_prediction: 'Predicción', kind_toast: 'Brindis', kind_story: 'Historia', guests: 'invitados', answered: 'respondieron',
  },
  fr: {
    join_title: 'Rejoignez les jeux du mariage', your_name: 'Votre prénom', pick_side: 'De quel côté êtes-vous ?', pick_avatar: 'Choisissez votre avatar',
    group_mode: 'Vous répondez pour une famille ou un groupe sur un seul téléphone ?', group_size: 'Combien de personnes ?', join_btn: 'Je participe',
    have_code: 'Déjà inscrit sur un autre téléphone ?', guest_code: 'Votre code invité à 6 chiffres', resume_btn: 'Continuer', wedding_code: 'Code du mariage',
    your_code_is: 'Votre code invité (pour continuer sur un autre téléphone) :', waiting: 'En attente du prochain jeu…', locked: 'Réponse enregistrée ! On attend tout le monde…',
    correct: 'Bonne réponse !', wrong: 'Pas tout à fait — c\'était', split: "Ils ne sont pas d'accord ! Pas de points cette fois.", too_slow: 'Temps écoulé !', points: 'points', rank: 'Rang', your_team: 'Votre équipe',
    vote_title: 'Votez !', voted: 'Vote enregistré !', write_note: 'Laissez un vœu pour les mariés', note_placeholder: 'Écrivez un mot gentil…', send: 'Envoyer',
    note_sent: 'Envoyé — merci !', note_pending: 'Merci ! Un hôte le relira avant l\'affichage sur grand écran.', leaderboard: 'Classement',
    sides_score: 'Côté contre côté', finale: 'Et le côté gagnant est…', offline: 'Vous êtes hors ligne — votre réponse partira dès le retour du réseau.',
    shoe_title: 'Qui est-ce ? Votez !', guess_song: 'Devinez la chanson !', language: 'Langue', thanks: 'Merci d\'avoir joué !', prompt_title: 'Partagez avec les mariés',
    now_playing: 'En cours', playing_as: 'Vous jouez en tant que', scan_to_join: 'Scannez pour participer', or_visit: 'ou allez sur', enter_code: 'et saisissez le code',
    kind_advice: 'Conseil', kind_wish: 'Vœu', kind_prediction: 'Prédiction', kind_toast: 'Toast', kind_story: 'Anecdote', guests: 'invités', answered: 'ont répondu',
  },
};

export const LANGS = SITE.weddings.languages;
export function t(lang, key) { return (T[lang] && T[lang][key]) || EN[key] || key; }

const loaded = new Set();
// Load the Noto family for a script only when it's needed.
export function useLanguage(lang) {
  const info = LANGS[lang] || LANGS.en;
  if (info.font && !loaded.has(info.font)) {
    loaded.add(info.font);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(info.font).replace(/%20/g, '+')}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }
  return info;
}
export function fontStack(lang) { const f = LANGS[lang]?.font; return f ? `'${f}', 'Fredoka', system-ui, sans-serif` : ''; }

// Text of an item in a language (falls back to the English source).
export function itemText(item, lang) { return lang && lang !== 'en' && item?.translations?.[lang]?.text ? item.translations[lang].text : item?.text || ''; }
export function optionText(item, i, lang) { return lang && lang !== 'en' && item?.translations?.[lang]?.options?.[i] ? item.translations[lang].options[i] : item?.options?.[i] || ''; }
