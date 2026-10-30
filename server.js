const express = require('express');
const cors = require('cors');
const { makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
let pairingCode = null;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false, // WAJIB FALSE untuk pairing code
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ WhatsApp Terhubung!');
            pairingCode = null;
        }
    });
}

startBot();

// Endpoint untuk minta kode pairing (dipanggil dari web)
app.post('/api/request-code', async (req, res) => {
    const { phone } = req.body;
    if (!sock) return res.status(500).json({ error: 'Socket belum siap' });
    
    // Cek apakah sudah terdaftar
    if (sock.authState.creds.registered) {
        return res.json({ message: 'Sudah terhubung sebelumnya' });
    }

    try {
        // Format nomor: hanya angka, pakai kode negara (contoh: 6281234567890)
        const code = await sock.requestPairingCode(phone);
        pairingCode = code;
        res.json({ code: code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint untuk kirim reaksi (sesuai kode sebelumnya)
app.post('/api/react', async (req, res) => {
    const { url, emoji } = req.body;
    if (!sock) return res.status(500).json({ error: 'WA belum konek' });

    try {
        const match = url.match(/channel\/([a-zA-Z0-9]+)\/([0-9]+)/);
        if (!match) return res.status(400).json({ error: 'URL salah' });

        let channelId = match[1].endsWith('@newsletter') ? match[1] : match[1] + '@newsletter';
        const serverId = match[2];

        await sock.newsletterReactMessage(channelId, serverId, emoji);
        res.json({ success: true, message: 'Emoji masuk!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server jalan di port ' + PORT));