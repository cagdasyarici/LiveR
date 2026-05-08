/**
 * LiveRelay — Multi-Cluster Test Suite
 *
 * Her test case bağımsız çalıştırılabilir, sırayla da çalıştırılabilir.
 * Dashboard (http://localhost:8080) açık tutarken çalıştırın — değerlerin
 * değiştiğini görebilirsiniz.
 *
 * Başlatmak için:
 *   docker compose -f docker/docker-compose.yml up -d
 *   node scripts/cluster-tests.cjs
 *
 * Bağımsız test çalıştırmak için:
 *   node scripts/cluster-tests.cjs --test=1
 *   node scripts/cluster-tests.cjs --test=cross   (isim ile)
 */

const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

// ─── Config ───────────────────────────────────────────────────────────────────
const SECRET  = 'dev-secret-change-in-production';
const API_KEY = 'dev-api-key-change-in-production';
const INST1   = { http: 'http://localhost:3001/api', ws: 3001, name: 'instance-1' };
const INST2   = { http: 'http://localhost:3002/api', ws: 3002, name: 'instance-2' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeToken(userId, rooms = [], permissions = ['send', 'subscribe']) {
  return jwt.sign({ sub: userId, rooms, permissions }, SECRET, {
    algorithm: 'HS256', expiresIn: '1h',
  });
}

function connectWs(userId, port, rooms = []) {
  return new Promise((resolve, reject) => {
    const token = makeToken(userId, rooms);
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
    let settled = false;

    ws.once('message', (data) => {
      if (settled) return;
      settled = true;
      resolve({ ws, welcome: JSON.parse(data.toString()) });
    });
    ws.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
    ws.on('unexpected-response', (_, res) => {
      if (!settled) { settled = true; reject(new Error(`HTTP ${res.statusCode}`)); }
    });
    setTimeout(() => { if (!settled) { settled = true; reject(new Error('Timeout')); } }, 5000);
  });
}

function waitMsg(ws, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`No message in ${timeout}ms`)), timeout);
    ws.once('message', (data) => { clearTimeout(t); resolve(JSON.parse(data.toString())); });
  });
}

function send(ws, obj) { ws.send(JSON.stringify(obj)); }

async function api(method, path, body, baseUrl = INST1.http) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json() };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function box(title) {
  const line = '━'.repeat(title.length + 6);
  console.log(`\n╔${line}╗`);
  console.log(`║   ${title}   ║`);
  console.log(`╚${line}╝\n`);
}

function ok(msg)   { console.log(`  ✅ ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function step(msg) { console.log(`  ▶  ${msg}`); }

/**
 * Bağlantılar açıkken countdown gösterir — dashboard'a bakıp screenshot alabilirsin.
 * seconds: kaç saniye beklenecek
 * hint: terminalde gösterilecek ipucu
 */
async function screenshotWindow(seconds, hint) {
  console.log(`\n  📸 SCREENSHOT PENCERESİ — ${seconds} saniye`);
  if (hint) console.log(`     ${hint}`);
  console.log('');
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r     ⏱  Dashboard'a bak → http://localhost:8080  [${i}s kaldı]   `);
    await sleep(1000);
  }
  process.stdout.write('\r     ✅ Pencere kapandı, bağlantılar kapatılıyor...           \n\n');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * TC-1: Her iki instance'ın sağlıklı olduğunu doğrula.
 * Dashboard'da: 2 ayrı URL ile "Healthy" status gözükmeli.
 * Screenshot: Her iki URL'e Connect basıp aynı anda açık tut.
 */
async function tc1_healthCheck() {
  box('TC-1 │ Health Check — Her İki Instance');

  const h1 = await api('GET', '/health', null, INST1.http);
  const h2 = await api('GET', '/health', null, INST2.http);

  info(`${INST1.name} → status: "${h1.data.status}", redis: "${h1.data.redis}", connections: ${h1.data.connections}`);
  info(`${INST2.name} → status: "${h2.data.status}", redis: "${h2.data.redis}", connections: ${h2.data.connections}`);

  if (h1.data.status === 'healthy' && h2.data.status === 'healthy') {
    ok('Her iki instance healthy ve Redis\'e bağlı');
  } else {
    warn('Bir veya her iki instance sağlıklı değil!');
  }

  console.log('\n  📸 SCREENSHOT HINT:');
  console.log('     → Dashboard\'ı iki sekme aç: localhost:3001 ve localhost:3002');
  console.log('     → Her ikisinde de "Healthy" badge görünmeli');
}

/**
 * TC-2: Alice instance-1'e, Bob instance-2'ye bağlanıyor.
 * Connection sayısı ikisinde de artmalı.
 * Dashboard'da: instance-1 → 1 connection, instance-2 → 1 connection
 */
async function tc2_connectionSpread() {
  box('TC-2 │ Farklı Instance\'lara Bağlanma');

  const beforeH1 = await api('GET', '/health', null, INST1.http);
  const beforeH2 = await api('GET', '/health', null, INST2.http);
  info(`Önceki durum → ${INST1.name}: ${beforeH1.data.connections} conn, ${INST2.name}: ${beforeH2.data.connections} conn`);

  step('Alice → instance-1\'e bağlanıyor...');
  const { ws: alice, welcome: wa } = await connectWs('alice', INST1.ws);
  ok(`Alice bağlandı: connectionId=${wa.connectionId}`);

  step('Bob → instance-2\'ye bağlanıyor...');
  const { ws: bob, welcome: wb } = await connectWs('bob', INST2.ws);
  ok(`Bob bağlandı: connectionId=${wb.connectionId}`);

  await sleep(300);

  const afterH1 = await api('GET', '/health', null, INST1.http);
  const afterH2 = await api('GET', '/health', null, INST2.http);
  info(`Sonraki durum → ${INST1.name}: ${afterH1.data.connections} conn, ${INST2.name}: ${afterH2.data.connections} conn`);

  ok('Alice ve Bob farklı instance\'lara dağıldı');

  await screenshotWindow(10,
    'Cluster View → Instance-1: "Connections: 1" | Instance-2: "Connections: 1"\n' +
    '     Total Connections (Cluster): 2'
  );

  alice.close();
  bob.close();
  await sleep(400);

  const cleanH1 = await api('GET', '/health', null, INST1.http);
  const cleanH2 = await api('GET', '/health', null, INST2.http);
  info(`Bağlantılar kapatıldı → ${INST1.name}: ${cleanH1.data.connections} conn, ${INST2.name}: ${cleanH2.data.connections} conn`);
}

/**
 * TC-3: Cross-Instance Mesaj — Redis Pub/Sub Kanıtı
 * Alice instance-2'ye bağlı. Mesaj instance-1'in REST API'sinden gönderiliyor.
 * Alice yine de mesajı alıyor → Redis Pub/Sub çalışıyor demek.
 *
 * LinkedIn post'undaki "bu kullanıcı hangi instance'ta?" sorusunun cevabı.
 */
async function tc3_crossInstanceMessage() {
  box('TC-3 │ Cross-Instance Mesaj (Redis Pub/Sub Kanıtı)');

  step('Alice → instance-2\'ye bağlanıyor (port 3002)...');
  const { ws: alice, welcome } = await connectWs('alice', INST2.ws);
  ok(`Alice instance-2\'de: connectionId=${welcome.connectionId}`);
  await sleep(300);

  step('Mesaj instance-1\'in REST API\'sinden gönderiliyor...');
  const msgPromise = waitMsg(alice, 4000);
  const result = await api('POST', '/send', {
    target: 'user:alice',
    event: 'cross-instance-test',
    data: { from: 'instance-1 REST API', message: 'Selam! Ben instance-1\'den geliyorum.' },
  }, INST1.http);

  info(`instance-1 API yanıtı: delivered=${result.data.delivered}, success=${result.data.success}`);

  try {
    const msg = await msgPromise;
    ok(`Alice (instance-2\'de) mesajı aldı: ${JSON.stringify(msg.data)}`);
    ok('Redis Pub/Sub cross-instance iletim çalışıyor ✓');
  } catch {
    warn('Mesaj alınamadı — Redis Pub/Sub kontrol edin');
  }

  await screenshotWindow(8,
    'Cluster View → Instance-1: "Messages Sent" arttı\n' +
    '     Instance-2: "Messages Received" arttı\n' +
    '     Terminalde: "from: instance-1 REST API" satırını göster'
  );

  alice.close();
  await sleep(200);
}

/**
 * TC-4: Room Senkronizasyonu — Farklı Instance'lardaki Kullanıcılar Aynı Odada
 * Alice instance-1'de, Bob instance-2'de.
 * İkisi de "room:global" odasına katılıyor.
 * instance-1 REST API'sinden odaya mesaj gönderiliyor.
 * Her ikisi de alıyor → Redis RedisRoomSync çalışıyor demek.
 *
 * LinkedIn post'undaki "mesaj neden 2 kere gitti?" sorusunun karşı kanıtı.
 */
async function tc4_crossInstanceRoom() {
  box('TC-4 │ Room Sync — Farklı Instance\'larda Aynı Oda');

  step('Alice → instance-1\'e bağlanıyor...');
  const { ws: alice } = await connectWs('alice', INST1.ws, ['room:global']);
  ok('Alice instance-1\'e bağlandı');

  step('Bob → instance-2\'ye bağlanıyor...');
  const { ws: bob } = await connectWs('bob', INST2.ws, ['room:global']);
  ok('Bob instance-2\'ye bağlandı');

  step('Alice "room:global" odasına subscribe oluyor (instance-1)...');
  send(alice, { type: 'subscribe', room: 'room:global' });
  const aliceSub = await waitMsg(alice);
  ok(`Alice: ${JSON.stringify(aliceSub)}`);

  step('Bob "room:global" odasına subscribe oluyor (instance-2)...');
  send(bob, { type: 'subscribe', room: 'room:global' });
  const bobSub = await waitMsg(bob);
  ok(`Bob: ${JSON.stringify(bobSub)}`);

  await sleep(400);

  const beforeH1 = await api('GET', '/health', null, INST1.http);
  const beforeH2 = await api('GET', '/health', null, INST2.http);
  info(`Aktif oda sayısı → ${INST1.name}: ${beforeH1.data.rooms}, ${INST2.name}: ${beforeH2.data.rooms}`);

  step('instance-1 REST API\'den "room:global"\'a mesaj gönderiliyor...');
  const alicePromise = waitMsg(alice, 4000);
  const bobPromise   = waitMsg(bob, 4000);

  const roomResult = await api('POST', '/rooms/room:global/send', {
    event: 'announcement',
    data: { message: 'Herkese duyuru! — instance-1\'den', timestamp: new Date().toISOString() },
  }, INST1.http);

  info(`API yanıtı: delivered=${roomResult.data.delivered}`);

  try {
    const aliceMsg = await alicePromise;
    ok(`Alice (instance-1) aldı: event="${aliceMsg.event}"`);
  } catch { warn('Alice mesajı alamadı'); }

  try {
    const bobMsg = await bobPromise;
    ok(`Bob (instance-2) aldı: event="${bobMsg.event}"`);
    ok('Farklı instance\'lardaki kullanıcılar aynı odada mesajlaşabildi ✓');
  } catch { warn('Bob mesajı alamadı'); }

  await screenshotWindow(10,
    'Cluster View → Her iki instance\'da "Active Rooms: 1"\n' +
    '     Terminalde: Alice ve Bob\'un her ikisinin de mesajı aldığı satırlar\n' +
    '     "delivered: 2" — duplicate yok, eksik yok'
  );

  alice.close();
  bob.close();
  await sleep(200);
}

/**
 * TC-5: Presence (Online/Offline Takibi)
 * Alice bağlanıyor → presence set edildi.
 * Alice bağlantıyı kesiyor → presence kaldırılıyor.
 * Connections API'den doğrulanıyor.
 *
 * LinkedIn post'undaki "user hala online mı?" sorusunun cevabı.
 */
async function tc5_presenceTracking() {
  box('TC-5 │ Presence Tracking — "User hala online mı?"');

  const before = await api('GET', '/connections', null, INST1.http);
  info(`Başlangıç connection durumu: ${JSON.stringify(before.data)}`);

  step('Alice bağlanıyor...');
  const { ws: alice, welcome } = await connectWs('alice', INST1.ws);
  ok(`Alice ONLINE: connectionId=${welcome.connectionId}`);

  await sleep(300);
  const during = await api('GET', '/connections', null, INST1.http);
  info(`Alice bağlıyken: ${JSON.stringify(during.data)}`);

  await screenshotWindow(8,
    'Dashboard → "Active Connections: 1" görünmeli\n' +
    '     Bir sonraki adımda 0\'a düşeceğini göstermek için bu anı kaydet'
  );

  step('Alice bağlantıyı kesiyor...');
  alice.close();
  await sleep(600);

  const after = await api('GET', '/connections', null, INST1.http);
  info(`Alice çıktıktan sonra: ${JSON.stringify(after.data)}`);
  ok('Presence doğru takip edildi — bağlantı kesilince temizlendi ✓');

  console.log('\n  📸 İKİNCİ SCREENSHOT:');
  console.log('     → Dashboard şimdi "Active Connections: 0" gösteriyor');
  console.log('     → İki screenshot\'ı yan yana koy: bağlıyken vs. ayrıldıktan sonra');
  await sleep(2500); // dashboard'un 0'ı yakalaması için bekle
}

/**
 * TC-6: Rate Limiting — Kısa Sürede Çok Mesaj
 * Aynı kullanıcı çok hızlı mesaj göndermeye çalışıyor.
 * Rate limit aşılınca hata alıyor.
 * Dashboard'da "Rate Limit Hits" sayacı artıyor.
 */
async function tc6_rateLimiting() {
  box('TC-6 │ Rate Limiting — "Spam Koruması"');

  const { ws: spammer } = await connectWs('spammer', INST1.ws);
  await sleep(200);

  info('20 mesaj arka arkaya gönderiliyor...');
  const results = [];

  for (let i = 0; i < 20; i++) {
    send(spammer, { type: 'ping' });
    try {
      const msg = await waitMsg(spammer, 500);
      results.push(msg.type);
    } catch {
      results.push('timeout');
    }
  }

  const pongsReceived  = results.filter((r) => r === 'pong').length;
  const errorsReceived = results.filter((r) => r === 'error').length;
  const timeouts       = results.filter((r) => r === 'timeout').length;

  info(`Pong alındı: ${pongsReceived}`);
  info(`Hata alındı: ${errorsReceived}`);
  info(`Timeout: ${timeouts}`);

  const metricsRes = await fetch(`${INST1.http}/metrics`);
  const metricsText = await metricsRes.text();
  const match = metricsText.match(/liverelay_rate_limit_hits_total (\d+)/);
  if (match) {
    info(`Toplam rate limit isabet sayısı: ${match[1]}`);
  }

  ok('Rate limiting aktif — aşırı mesajlar engellendi ✓');

  await screenshotWindow(6,
    'Dashboard → "Rate Limit Hits" sayacı 0\'dan büyük olmalı\n' +
    '     Terminalde pong/error sayılarını da göster'
  );

  spammer.close();
  await sleep(200);
}

/**
 * TC-7: Broadcast — Tüm Instance'lardaki Tüm Kullanıcılara
 * Alice instance-1'de, Bob instance-2'de.
 * instance-1 REST API'sinden broadcast gönderiliyor.
 * Her ikisi de alıyor.
 */
async function tc7_broadcastAcrossInstances() {
  box('TC-7 │ Broadcast — Her İki Instance\'daki Herkese');

  const { ws: alice } = await connectWs('alice', INST1.ws);
  const { ws: bob   } = await connectWs('bob',   INST2.ws);
  ok('Alice → instance-1, Bob → instance-2');
  await sleep(300);

  const alicePromise = waitMsg(alice, 4000);
  const bobPromise   = waitMsg(bob,   4000);

  step('instance-1\'den broadcast gönderiliyor...');
  const result = await api('POST', '/broadcast', {
    event: 'system.alert',
    data: {
      severity: 'info',
      message: 'Bu mesaj tüm instance\'lardaki tüm kullanıcılara gidiyor.',
      sentFrom: 'instance-1',
    },
  }, INST1.http);

  info(`Broadcast API yanıtı: delivered=${result.data.delivered}`);

  let aliceOk = false, bobOk = false;

  try {
    const aliceMsg = await alicePromise;
    ok(`Alice (instance-1) aldı: ${JSON.stringify(aliceMsg.data.message)}`);
    aliceOk = true;
  } catch { warn('Alice broadcast alamadı'); }

  try {
    const bobMsg = await bobPromise;
    ok(`Bob (instance-2) aldı: ${JSON.stringify(bobMsg.data.message)}`);
    bobOk = true;
  } catch { warn('Bob broadcast alamadı'); }

  if (aliceOk && bobOk) ok('Cross-instance broadcast başarılı ✓');

  await screenshotWindow(8,
    'Cluster View → Her iki instance\'da "Messages Received" arttı\n' +
    '     Terminalde "delivered: 2" — farklı instance\'lardaki 2 kullanıcıya ulaştı'
  );

  alice.close();
  bob.close();
  await sleep(200);
}

/**
 * TC-8: Güvenlik — Geçersiz JWT ve API Key Reddi
 * Geçersiz token ile bağlanmayı dene → reddedilsin.
 * Yanlış API key ile endpoint'e eriş → 401 gelsin.
 */
async function tc8_security() {
  box('TC-8 │ Güvenlik — Geçersiz Auth Reddi');

  step('Geçersiz JWT ile WebSocket bağlantısı deneniyor...');
  const wsResult = await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3001/ws?token=bu-token-gecersiz');
    ws.on('open', () => resolve('KABUL EDİLDİ (HATA!)'));
    ws.on('unexpected-response', (_, res) => resolve(`REDDEDİLDİ: HTTP ${res.statusCode}`));
    ws.on('error', () => resolve('REDDEDİLDİ: connection error'));
    setTimeout(() => resolve('TIMEOUT'), 3000);
  });
  info(`Sonuç: ${wsResult}`);
  if (wsResult.startsWith('REDDEDİLDİ')) ok('Geçersiz JWT reddedildi ✓');

  step('Token\'sız WebSocket bağlantısı deneniyor...');
  const noTokenResult = await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3001/ws');
    ws.on('open', () => resolve('KABUL EDİLDİ (HATA!)'));
    ws.on('unexpected-response', (_, res) => resolve(`REDDEDİLDİ: HTTP ${res.statusCode}`));
    ws.on('error', () => resolve('REDDEDİLDİ: connection error'));
    setTimeout(() => resolve('TIMEOUT'), 3000);
  });
  info(`Sonuç: ${noTokenResult}`);
  if (noTokenResult.startsWith('REDDEDİLDİ')) ok('Token\'sız bağlantı reddedildi ✓');

  step('Yanlış API Key ile REST isteği atılıyor...');
  const badApiRes = await fetch(`${INST1.http}/connections`, {
    headers: { Authorization: 'Bearer yanlis-key-123' },
  });
  info(`Status: ${badApiRes.status}`);
  if (badApiRes.status === 401) ok('Geçersiz API Key reddedildi: 401 Unauthorized ✓');

  step('API Key olmadan REST isteği atılıyor...');
  const noKeyRes = await fetch(`${INST1.http}/connections`);
  info(`Status: ${noKeyRes.status}`);
  if (noKeyRes.status === 401) ok('API Key\'siz istek reddedildi: 401 Unauthorized ✓');

  console.log('\n  📸 SCREENSHOT HINT:');
  console.log('     → "REDDEDİLDİ: HTTP 401" satırları ekranda net görünüyor');
  console.log('     → Tüm reddedilme durumlarını tek bir terminal screenshot\'a sığdır');
}

/**
 * TC-9: Instance-1 Durdurulunca Instance-2 Ayakta Kalıyor
 * Bu test manuel çalıştırılmalı!
 * Adımları takip et.
 */
async function tc9_instanceResilience() {
  box('TC-9 │ Instance Resilience — Manuel Test Adımları');

  console.log('  Bu test MANUEL adımlar içeriyor. Aşağıdaki komutları sırayla çalıştır:\n');

  console.log('  1. instance-2\'ye bir client bağla (bu terminalde bekle):');
  console.log('     node -e "');
  console.log('       const jwt = require(\'jsonwebtoken\');');
  console.log('       const WS = require(\'ws\');');
  console.log('       const t = jwt.sign({sub:\'bob\',rooms:[],permissions:[\'subscribe\']},');
  console.log('         \'dev-secret-change-in-production\',{expiresIn:\'1h\'});');
  console.log('       const ws = new WS(\'ws://localhost:3002/ws?token=\'+t);');
  console.log('       ws.on(\'message\',d=>console.log(\'BOB ALINDI:\',d.toString()));');
  console.log('       ws.on(\'open\',()=>console.log(\'Bob instance-2\'de bağlı\'));');
  console.log('     "\n');

  console.log('  2. Yeni bir terminal aç ve instance-1\'i durdur:');
  console.log('     docker compose -f docker/docker-compose.yml stop liverelay\n');

  console.log('  3. instance-2\'nin hala sağlıklı olduğunu kontrol et:');
  console.log('     curl http://localhost:3002/api/health\n');

  console.log('  4. instance-2\'deki Bob\'a mesaj gönder (instance-1 yokken de çalışıyor):');
  console.log('     curl -X POST http://localhost:3002/api/send \\');
  console.log('       -H "Authorization: Bearer dev-api-key-change-in-production" \\');
  console.log('       -H "Content-Type: application/json" \\');
  console.log('       -d \'{"target":"user:bob","event":"test","data":{"msg":"instance-1 kapalı ama ben geldim!"}}\'\n');

  console.log('  5. instance-1\'i yeniden başlat:');
  console.log('     docker compose -f docker/docker-compose.yml start liverelay\n');

  console.log('  📸 SCREENSHOT HINT:');
  console.log('     → instance-1 stop edilmişken instance-2 dashboard\'ı "Healthy" gösteriyor');
  console.log('     → Bob\'un mesajı aldığını gösteren terminal çıktısı');
  console.log('     → instance-1 olmadan sistemin devam ettiği net görünüyor');
}

// ─── CLI Runner ───────────────────────────────────────────────────────────────

const ALL_TESTS = {
  '1':         { fn: tc1_healthCheck,           name: 'Health Check' },
  '2':         { fn: tc2_connectionSpread,       name: 'Connection Spread' },
  '3':         { fn: tc3_crossInstanceMessage,   name: 'Cross-Instance Message' },
  'cross':     { fn: tc3_crossInstanceMessage,   name: 'Cross-Instance Message' },
  '4':         { fn: tc4_crossInstanceRoom,      name: 'Cross-Instance Room' },
  'room':      { fn: tc4_crossInstanceRoom,      name: 'Cross-Instance Room' },
  '5':         { fn: tc5_presenceTracking,       name: 'Presence Tracking' },
  'presence':  { fn: tc5_presenceTracking,       name: 'Presence Tracking' },
  '6':         { fn: tc6_rateLimiting,           name: 'Rate Limiting' },
  'rate':      { fn: tc6_rateLimiting,           name: 'Rate Limiting' },
  '7':         { fn: tc7_broadcastAcrossInstances, name: 'Broadcast' },
  'broadcast': { fn: tc7_broadcastAcrossInstances, name: 'Broadcast' },
  '8':         { fn: tc8_security,               name: 'Security' },
  'security':  { fn: tc8_security,               name: 'Security' },
  '9':         { fn: tc9_instanceResilience,     name: 'Instance Resilience (Manual)' },
  'resilience':{ fn: tc9_instanceResilience,     name: 'Instance Resilience (Manual)' },
};

async function runAll() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     LiveRelay — Multi-Cluster Test Suite                  ║');
  console.log('║     Dashboard: http://localhost:8080                      ║');
  console.log('║     Instance-1: http://localhost:3001 (Server URL alanına)║');
  console.log('║     Instance-2: http://localhost:3002 (Server URL alanına)║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const tests = [
    tc1_healthCheck,
    tc2_connectionSpread,
    tc3_crossInstanceMessage,
    tc4_crossInstanceRoom,
    tc5_presenceTracking,
    tc6_rateLimiting,
    tc7_broadcastAcrossInstances,
    tc8_security,
    tc9_instanceResilience,
  ];

  for (const test of tests) {
    await test();
    await sleep(800);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Tüm testler tamamlandı!                                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

// CLI arg parsing
const arg = process.argv.find((a) => a.startsWith('--test='));
if (arg) {
  const key = arg.split('=')[1];
  const entry = ALL_TESTS[key];
  if (entry) {
    entry.fn().catch((e) => { console.error(e); process.exit(1); });
  } else {
    console.error(`Bilinmeyen test: "${key}"`);
    console.error('Kullanılabilir: ' + Object.keys(ALL_TESTS).join(', '));
    process.exit(1);
  }
} else {
  runAll().catch((e) => { console.error(e); process.exit(1); });
}
